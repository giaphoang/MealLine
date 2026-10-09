"""Deterministic MealLine inventory matching.

No model output is interpreted as an item match.  The voice agent fetches the
inventory, normalizes the response, and this module applies every dietary and
kitchen rule in a stable input order.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from math import ceil
from typing import Any


class MatcherInputError(ValueError):
    """Raised when an intake field cannot be interpreted safely."""


@dataclass(frozen=True, slots=True)
class InventoryItem:
    """The subset of a MealLine item needed by the matcher."""

    id: int
    name: str
    quantity: int
    unit: str
    is_in_stock: bool
    vegan: bool
    vegetarian: bool
    gluten_free: bool
    halal: bool
    kosher: bool
    requires_stove: bool
    requires_fridge: bool
    ready_to_eat: bool

    def to_list_item(self, requested_quantity: int, dietary_avoid: Sequence[str]) -> dict[str, Any]:
        """Return the JSON shape MealLine accepts inside ``generatedData``."""

        quantity = min(self.quantity, requested_quantity)
        # An in-stock item always has a positive quantity after normalization;
        # retaining this guard makes the function safe for mocked inventories.
        quantity = max(1, quantity)
        result: dict[str, Any] = {
            "foodItemId": self.id,
            "name": self.name,
            "quantity": quantity,
            "unit": self.unit,
        }
        if dietary_avoid:
            result["notes"] = "Avoids: " + ", ".join(dietary_avoid)
        return result


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _text(value: object, default: str = "") -> str:
    return value.strip() if isinstance(value, str) else default


def _bool(value: object, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _positive_int(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, float) and value.is_integer() and value >= 0:
        return int(value)
    return default


def normalize_inventory_item(raw: Mapping[str, object]) -> InventoryItem:
    """Normalize either FEED's nested response or MealLine's legacy flat shape."""

    fulfilment = _mapping(raw.get("fulfilment"))
    status = _mapping(raw.get("statusFlags"))
    dietary = _mapping(raw.get("dietaryFlags"))
    item_id = _positive_int(raw.get("id"))
    name = _text(raw.get("name"))
    if item_id < 1 or not name:
        raise MatcherInputError("Each inventory item needs a positive id and non-empty name")
    return InventoryItem(
        id=item_id,
        name=name,
        quantity=_positive_int(fulfilment.get("quantity", raw.get("quantity"))),
        unit=_text(fulfilment.get("unit", raw.get("unit")), "unit") or "unit",
        is_in_stock=_bool(status.get("isInStock", raw.get("isInStock"))),
        vegan=_bool(dietary.get("vegan", raw.get("vegan"))),
        vegetarian=_bool(dietary.get("vegetarian", raw.get("vegetarian"))),
        gluten_free=_bool(dietary.get("glutenFree", raw.get("glutenFree"))),
        halal=_bool(dietary.get("halal", raw.get("halal"))),
        kosher=_bool(dietary.get("kosher", raw.get("kosher"))),
        requires_stove=_bool(fulfilment.get("requiresStove", raw.get("requiresStove"))),
        requires_fridge=_bool(fulfilment.get("requiresFridge", raw.get("requiresFridge"))),
        ready_to_eat=_bool(dietary.get("readyToEat", raw.get("readyToEat"))),
    )


_SHELLFISH = re.compile(r"(?:shrimp|prawn|shellfish|crab|lobster|clam|mussel|oyster|scallop)", re.I)
_NUT = re.compile(r"(?:nut|peanut|almond|walnut|cashew|pecan|hazelnut|pistachio)", re.I)
_DAIRY = re.compile(r"\b(?:dairy|milk|cheese|yogurt|yoghurt|butter|cream|whey|casein)\b", re.I)
_PORK = re.compile(r"\b(?:pork|ham|bacon|lard|prosciutto|pepperoni)\b", re.I)
_SOY = re.compile(r"\b(?:soy|soya|edamame|tofu|tempeh)\b", re.I)
_EGG = re.compile(r"\b(?:egg|eggs|mayonnaise|mayo)\b", re.I)
_FROZEN_OR_UNCOOKED = re.compile(r"\b(?:frozen|uncooked|raw)\b", re.I)
_FRESH = re.compile(r"\b(?:fresh|refrigerated|chilled)\b", re.I)


def _avoidance_matches(name: str, avoidance: set[str], item: InventoryItem) -> bool:
    """Return true when an item violates one of the requested avoidances."""

    if any("peanut" in value for value in avoidance) and re.search(r"peanut", name, re.I):
        return True
    if any("dairy" in value for value in avoidance) and _DAIRY.search(name):
        return True
    if any("pork" in value for value in avoidance) and _PORK.search(name):
        return True
    if any("shellfish" in value for value in avoidance) and _SHELLFISH.search(name):
        return True
    if any("gluten" in value for value in avoidance) and not item.gluten_free:
        return True
    if any("soy" in value for value in avoidance) and _SOY.search(name):
        return True
    if any("egg" in value for value in avoidance) and _EGG.search(name):
        return True
    if any("nut" in value for value in avoidance) and _NUT.search(name):
        return True
    if any("vegetarian" in value for value in avoidance) and not item.vegetarian:
        return True
    if any("vegan" in value for value in avoidance) and not item.vegan:
        return True
    if any("halal" in value for value in avoidance) and not item.halal:
        return True
    if any("kosher" in value for value in avoidance) and not item.kosher:
        return True
    return False


def requested_quantity(household_size: int | None) -> int:
    """Scale one stock item for a household, never returning zero."""

    if household_size is None:
        return 1
    if isinstance(household_size, bool) or not isinstance(household_size, int) or household_size < 1:
        raise MatcherInputError("householdSize must be a positive integer or null")
    return max(1, ceil(household_size / 2))


def match_inventory(
    raw_items: Sequence[Mapping[str, object]],
    *,
    dietary_avoid: Sequence[str] = (),
    household_size: int | None = None,
    has_stove: bool | None = None,
    has_fridge: bool | None = None,
    max_items: int = 20,
) -> list[InventoryItem]:
    """Apply stock, dietary, equipment, scaling, and cap rules deterministically.

    The returned item objects contain the available stock quantity.  Call
    :func:`build_generated_data` to apply household scaling to list quantities.
    """

    if not isinstance(max_items, int) or isinstance(max_items, bool) or not 1 <= max_items <= 20:
        raise MatcherInputError("max_items must be between 1 and 20")
    scale = requested_quantity(household_size)
    del scale  # Validate now; the value is applied by build_generated_data.
    avoid = {value.strip().lower() for value in dietary_avoid if value.strip()}
    stove = True if has_stove is None else has_stove
    fridge = True if has_fridge is None else has_fridge
    if not isinstance(stove, bool) or not isinstance(fridge, bool):
        raise MatcherInputError("hasStove and hasFridge must be boolean or null")

    result: list[InventoryItem] = []
    for raw in raw_items:
        item = normalize_inventory_item(raw)
        if not item.is_in_stock or item.quantity <= 0:
            continue
        name = item.name
        if _avoidance_matches(name, avoid, item):
            continue
        # `requiresStove`/`requiresFridge` are authoritative when populated;
        # lexical checks retain MealLine's safety rule for imperfect inventory
        # records that omit those flags.
        if not stove and (item.requires_stove or _FROZEN_OR_UNCOOKED.search(name)):
            continue
        if not fridge and (item.requires_fridge or _FRESH.search(name) or _DAIRY.search(name)):
            continue
        result.append(item)
        if len(result) >= max_items:
            break
    return result


def build_generated_data(
    matched: Sequence[InventoryItem],
    *,
    household_size: int | None,
    dietary_avoid: Sequence[str],
    metadata: Mapping[str, object],
) -> dict[str, object]:
    """Build the persist-only FEED payload from matcher output and metadata."""

    quantity = requested_quantity(household_size)
    items = [item.to_list_item(quantity, dietary_avoid) for item in matched[:20]]
    return {"metadata": dict(metadata), "items": items, "itemCount": len(items)}


def item_as_dict(item: InventoryItem) -> dict[str, Any]:
    """Useful for logs/tests without exposing implementation-specific fields."""

    return asdict(item)
