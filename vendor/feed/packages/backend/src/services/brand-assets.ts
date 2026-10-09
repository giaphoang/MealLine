// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as crypto from 'crypto';
import {
  DOMParser,
  XMLSerializer,
  type Attr,
  type Document,
  type Element,
  type Node,
} from '@xmldom/xmldom';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import prisma from '../db';
import { AdminAuditService, type AuditActor } from './auth/admin-audit-service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './auth/authorization';
import { brandAssetIds } from './brand-config';

export const BRAND_ASSET_CLEANUP_GRACE_MS = 60 * 60 * 1000;
export const MIN_LOGO_RASTER_WIDTH = 576;
export const MIN_LOGO_RASTER_HEIGHT = 160;
export const MIN_SQUARE_RASTER_SIZE = 512;

const FORBIDDEN_SVG_ELEMENTS = new Set([
  'script', 'foreignobject', 'iframe', 'embed', 'object', 'image', 'video',
  'audio', 'canvas', 'base', 'feimage', 'handler', 'discard',
  'animate', 'animatemotion', 'animatetransform', 'set',
]);
const URI_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'xml:base']);
const UNSAFE_CSS = /(?:@import|expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript\s*:|vbscript\s*:|data\s*:)/i;

const badAsset = (message: string, code = 'INVALID_BRAND_ASSET') =>
  Object.assign(new Error(message), { statusCode: 400, code });

const isUnsafeUri = (value: string): boolean => {
  const compact = value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  return compact.length > 0 && !compact.startsWith('#');
};

const containsUnsafeCssUrl = (value: string): boolean => {
  const matches = value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi);
  return [...matches].some((match) => isUnsafeUri(match[2] ?? ''));
};

const sanitizeElement = (element: Element): void => {
  const attributes = Array.from({ length: element.attributes.length }, (_, index) => element.attributes.item(index))
    .filter((attribute): attribute is Attr => attribute !== null);

  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (
      name.startsWith('on')
      || (URI_ATTRIBUTES.has(name) && isUnsafeUri(value))
      || ((name === 'style' || /url\(/i.test(value)) && (UNSAFE_CSS.test(value) || containsUnsafeCssUrl(value)))
    ) {
      element.removeAttributeNode(attribute);
    }
  }

  if (element.localName?.toLowerCase() === 'style') {
    const css = element.textContent ?? '';
    if (UNSAFE_CSS.test(css) || containsUnsafeCssUrl(css)) element.parentNode?.removeChild(element);
  }
};

const sanitizeSvgTree = (parent: Node): void => {
  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (child.nodeType === child.PROCESSING_INSTRUCTION_NODE || child.nodeType === child.DOCUMENT_TYPE_NODE) {
      parent.removeChild(child);
    } else if (child.nodeType === child.ELEMENT_NODE) {
      const element = child as Element;
      if (FORBIDDEN_SVG_ELEMENTS.has(element.localName?.toLowerCase() ?? element.nodeName.toLowerCase())) {
        parent.removeChild(child);
      } else {
        sanitizeElement(element);
        if (element.parentNode) sanitizeSvgTree(element);
      }
    }
    child = next;
  }
};

/**
 * Preserve SVG vector geometry while removing active content and references
 * that could contact another server. Safe class-based styles are deliberately
 * retained because exported Illustrator/Inkscape logos rely on them.
 */
export const sanitizeBrandSvg = (source: Buffer | string): Buffer => {
  const input = (Buffer.isBuffer(source) ? source.toString('utf8') : source)
    .replace(/^\uFEFF/, '')
    .trimStart();
  // Parse no DTD at all. It is never needed for a logo and removing it after
  // parsing would be too late to make entity expansion an impossible code path.
  if (/<!doctype/i.test(input)) {
    throw badAsset('That SVG uses an XML document type, which is not allowed in brand images. Export it as a standard self-contained SVG and try again.');
  }
  let document: Document;
  try {
    document = new DOMParser({
      locator: false,
      onError: (level, message) => {
        if (level !== 'warning') throw new Error(message);
      },
    }).parseFromString(input, 'image/svg+xml');
  } catch {
    throw badAsset('FEED could not read that SVG. Export it as a standard SVG file and try again.');
  }

  const root = document.documentElement;
  if (!root || root.localName?.toLowerCase() !== 'svg') {
    throw badAsset('That file is not an SVG image. Export it as SVG and try again.', 'BRAND_ASSET_TYPE_MISMATCH');
  }

  sanitizeElement(root);
  sanitizeSvgTree(document);
  const output = new XMLSerializer().serializeToString(document);
  return Buffer.from(output, 'utf8');
};

type PreparedBrandAsset = {
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
  width: number;
  height: number;
  isVector: boolean;
};

const sniffRasterMimeType = (buffer: Buffer): PreparedBrandAsset['mimeType'] | null => {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

const looksLikeSvg = (buffer: Buffer): boolean => {
  const opening = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart();
  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?<svg(?:\s|>)/i.test(opening);
};

export const prepareBrandAsset = async (buffer: Buffer): Promise<PreparedBrandAsset> => {
  try {
    if (looksLikeSvg(buffer)) {
      const data = sanitizeBrandSvg(buffer);
      // No pixel limit here, deliberately. Reading an SVG's dimensions does not
      // decode anything — the limit would only reject a large *artboard*, which
      // says nothing about cost. A vector's real expense is rasterisation, and
      // that is bounded by the output size in `rasterDensityFor`, not by the
      // coordinate system it was drawn in. The upload size cap and the
      // sanitiser remain the guards on the source itself.
      const metadata = await sharp(data, { failOn: 'error', limitInputPixels: false }).metadata();
      if (!metadata.width || !metadata.height) {
        throw badAsset('FEED could not determine that SVG logo’s dimensions. Add a viewBox or width and height, then try again.');
      }
      return { data, mimeType: 'image/svg+xml', width: metadata.width, height: metadata.height, isVector: true };
    }

    const mimeType = sniffRasterMimeType(buffer);
    if (!mimeType) {
      throw badAsset('That file type is not supported. Upload a PNG, JPEG, WebP, or SVG image.', 'UNSUPPORTED_BRAND_ASSET_TYPE');
    }

    const pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
    const transformed = mimeType === 'image/png'
      ? pipeline.png({ compressionLevel: 9 })
      : mimeType === 'image/jpeg'
        ? pipeline.jpeg({ quality: 92, mozjpeg: true })
        : pipeline.webp({ quality: 92 });
    const output = await transformed.toBuffer({ resolveWithObject: true });
    if (!output.info.width || !output.info.height) throw badAsset('FEED could not read that image. Export it again and try again.');
    return { data: output.data, mimeType, width: output.info.width, height: output.info.height, isVector: false };
  } catch (error) {
    if ((error as { statusCode?: unknown })?.statusCode === 400) throw error;
    throw badAsset('FEED could not read that image. Export it as PNG, JPEG, WebP, or SVG and try again.');
  }
};

const safeFilename = (filename: string): string =>
  filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 160) || 'brand-image';

export const storeBrandAsset = async (prepared: PreparedBrandAsset, filename: string) => {
  const id = crypto.randomUUID();
  const stored = safeFilename(filename);
  await prisma.brandAsset.create({
    data: {
      id,
      filename: stored,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      dataBase64: prepared.data.toString('base64'),
    },
  });
  return {
    kind: 'database' as const,
    id,
    // Carried on the reference so the wizard can name the file that is
    // actually saved. A native file input is cleared straight after upload so
    // that re-picking the same file still fires `change`, which leaves it
    // reading "No file chosen" no matter what was uploaded.
    filename: stored,
    width: prepared.width,
    height: prepared.height,
    mimeType: prepared.mimeType,
  };
};

/**
 * Density that renders a vector at the size we actually need.
 *
 * `density` is DPI relative to the SVG's OWN coordinate system, not to the
 * output. A fixed 300 therefore scales the viewBox by 300/72 ≈ 4.17×, so cost
 * depended on whatever coordinate system the designer happened to export
 * rather than on the size being produced. A 5120px viewBox — an ordinary
 * Illustrator artboard — rasterised to 21,333px per side, or 455 million
 * pixels against sharp's 40 million limit, and threw `Input image exceeds
 * pixel limit` before any resize could shrink it. Every SVG app mark with a
 * viewBox above ~1518px failed to upload, and since that is a plain sharp
 * error rather than a `badAsset` it surfaced as the generic 500.
 *
 * Deriving the density from the target keeps the supersampling that made 300
 * attractive — the render is still twice the output before it is filtered down
 * — while making the raster exactly as large as it needs to be. The bounds are
 * only for degenerate viewBoxes; in the normal case the rendered size is the
 * target, whatever the artboard.
 */
const VECTOR_SUPERSAMPLE = 2;

const rasterDensityFor = (prepared: PreparedBrandAsset, size: number): number => {
  const intrinsic = Math.max(prepared.width, prepared.height);
  if (!Number.isFinite(intrinsic) || intrinsic <= 0) return 72;
  return Math.min(2400, Math.max(0.01, (72 * size * VECTOR_SUPERSAMPLE) / intrinsic));
};

/**
 * Guess whether a logo needs a dark plate behind it in light mode.
 *
 * The tell is a mark drawn for placing over photography: a transparent ground
 * with light artwork on it. On FEED's light surface that artwork is close to
 * invisible, and the person uploading it usually cannot see the problem
 * because their source file is being previewed on a dark canvas.
 *
 * Measured on the actual pixels rather than guessed from the file: rasterise
 * small, then ask what fraction of the image is transparent and how light the
 * artwork that remains is. Both conditions must hold. A light mark on an opaque
 * light background is a different problem and not one a plate fixes, and a dark
 * mark on a transparent ground is exactly what the light surface wants.
 *
 * This is a suggestion, never a decision — it is returned with the upload for
 * the wizard to offer, and the person can always say otherwise.
 */
export type LogoPresentationHint = {
  suggested: 'transparent' | 'dark-surface';
  transparentFraction: number;
  artworkLightness: number;
  reason: string;
};

const TRANSPARENT_ALPHA = 32;   // out of 255; anti-aliased edges are not "ground"
const MOSTLY_TRANSPARENT = 0.2; // a fifth of the frame with nothing in it
const LIGHT_ARTWORK = 0.62;     // mean relative luminance of what is drawn

export const describeLogoPresentation = async (
  prepared: PreparedBrandAsset,
): Promise<LogoPresentationHint> => {
  const density = prepared.isVector ? rasterDensityFor(prepared, 96) : undefined;
  const { data, info } = await sharp(prepared.data, {
    ...(density === undefined ? {} : { density }),
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .resize(96, 96, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparent = 0;
  let drawn = 0;
  let luminance = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3];
    if (alpha < TRANSPARENT_ALPHA) {
      transparent += 1;
      continue;
    }
    drawn += 1;
    // Rec. 709 relative luminance, which tracks perceived lightness far better
    // than a flat channel average on saturated brand colours.
    luminance += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }

  const total = transparent + drawn;
  const transparentFraction = total ? transparent / total : 0;
  const artworkLightness = drawn ? luminance / drawn : 0;
  const needsPlate =
    transparentFraction >= MOSTLY_TRANSPARENT && artworkLightness >= LIGHT_ARTWORK;

  return {
    suggested: needsPlate ? 'dark-surface' : 'transparent',
    transparentFraction,
    artworkLightness,
    reason: needsPlate
      ? `This mark is ${Math.round(transparentFraction * 100)}% transparent and what is drawn is light, so it would nearly disappear on a light page. FEED can give it a dark plate.`
      : 'This mark reads on a light page, so it is placed directly on the background.',
  };
};

export const storeSquareBrandDerivative = async (
  prepared: PreparedBrandAsset,
  filename: string,
  size: number,
) => {
  const input = prepared.isVector
    ? sharp(prepared.data, {
        density: rasterDensityFor(prepared, size),
        failOn: 'error',
        limitInputPixels: 40_000_000,
      })
    : sharp(prepared.data, { failOn: 'error', limitInputPixels: 40_000_000 });
  const output = await input
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return storeBrandAsset({
    data: output.data,
    mimeType: 'image/png',
    width: output.info.width,
    height: output.info.height,
    isVector: false,
  }, `${size}-${filename}`);
};

export type BrandAssetKind = 'logo-light' | 'logo-dark' | 'square';

export const brandAssetResolutionWarnings = (
  prepared: PreparedBrandAsset,
  kind: BrandAssetKind,
): string[] => {
  if (prepared.isVector) return [];
  const minimumWidth = kind === 'square' ? MIN_SQUARE_RASTER_SIZE : MIN_LOGO_RASTER_WIDTH;
  const minimumHeight = kind === 'square' ? MIN_SQUARE_RASTER_SIZE : MIN_LOGO_RASTER_HEIGHT;
  if (prepared.width >= minimumWidth && prepared.height >= minimumHeight) return [];
  return [
    `This image is ${prepared.width} × ${prepared.height} px. For a crisp ${kind === 'square' ? 'app mark' : 'logo'} on high-density screens, use SVG or a PNG at least ${minimumWidth} × ${minimumHeight} px.`,
  ];
};

type BrandAssetStorageClient = Pick<Prisma.TransactionClient, 'brandAsset' | 'brandConfiguration'>;

const storageCheckWith = async (client: BrandAssetStorageClient, now: Date) => {
  const [assets, configurations] = await Promise.all([
    client.brandAsset.findMany({ orderBy: { createdAt: 'asc' } }),
    client.brandConfiguration.findMany({ select: { payload: true } }),
  ]);
  const referencedIds = new Set(configurations.flatMap((configuration) => [...brandAssetIds(configuration.payload)]));
  const unused = assets.filter((asset) => !referencedIds.has(asset.id));
  const eligible = unused.filter((asset) => now.getTime() - asset.createdAt.getTime() >= BRAND_ASSET_CLEANUP_GRACE_MS);
  const byteSize = (asset: { dataBase64: string }) => Buffer.byteLength(asset.dataBase64, 'base64');

  return {
    totalCount: assets.length,
    referencedCount: assets.filter((asset) => referencedIds.has(asset.id)).length,
    unusedCount: unused.length,
    unusedBytes: unused.reduce((sum, asset) => sum + byteSize(asset), 0),
    protectedRecentCount: unused.length - eligible.length,
    eligibleUnusedCount: eligible.length,
    eligibleUnusedBytes: eligible.reduce((sum, asset) => sum + byteSize(asset), 0),
    eligibleUnusedAssets: eligible.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteSize: byteSize(asset),
      createdAt: asset.createdAt,
    })),
  };
};

export const checkBrandAssetStorage = (now = new Date()) => storageCheckWith(prisma, now);

export const cleanupUnusedBrandAssets = (actor: AuditActor, now = new Date()) => prisma.$transaction(async (tx) => {
  const before = await storageCheckWith(tx, now);
  const ids = before.eligibleUnusedAssets.map((asset) => asset.id);
  const result = ids.length > 0
    ? await tx.brandAsset.deleteMany({ where: { id: { in: ids } } })
    : { count: 0 };
  const cleanup = {
    deletedCount: result.count,
    deletedBytes: before.eligibleUnusedBytes,
    protectedRecentCount: before.protectedRecentCount,
  };
  await AdminAuditService.record({
    actor,
    action: AUDIT_ACTIONS.BRAND_ASSETS_CLEANED,
    targetType: AUDIT_TARGET_TYPES.DATABASE,
    targetLabel: 'Brand assets',
    detail: cleanup,
  }, tx);
  return cleanup;
});
