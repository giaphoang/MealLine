// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import {
  motion,
  type TargetAndTransition,
  type VariantLabels,
  type HTMLMotionProps,
  type LegacyAnimationControls,
} from 'motion/react';

import { getStrictContext } from '@/lib/get-strict-context';
import { useControlledState } from '@/hooks/use-controlled-state';

type SwitchContextType = {
  isChecked: boolean;
  setIsChecked: (isChecked: boolean) => void;
  isPressed: boolean;
  setIsPressed: (isPressed: boolean) => void;
};

const [SwitchProvider, useSwitch] =
  getStrictContext<SwitchContextType>('SwitchContext');

type SwitchProps = Omit<
  React.ComponentProps<typeof SwitchPrimitives.Root>,
  'asChild'
> &
  HTMLMotionProps<'button'>;

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>((props, ref) => {
  const [isPressed, setIsPressed] = React.useState(false);
  const [isChecked, setIsChecked] = useControlledState({
    value: props.checked,
    defaultValue: props.defaultChecked,
    onChange: props.onCheckedChange,
  });

  // Radix's control props belong on Root, not on the DOM button underneath it.
  // Spreading all of `props` onto `motion.button` handed React an
  // `onCheckedChange` attribute it does not recognise, which it logged and
  // discarded on every render. Root still receives them below, and `asChild`
  // merges what the button legitimately needs onto this same element.
  /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to drop them */
  const {
    checked: _checked,
    defaultChecked: _defaultChecked,
    onCheckedChange: _onCheckedChange,
    required: _required,
    name: _name,
    value: _value,
    ...motionProps
  } = props;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return (
    <SwitchProvider
      value={{ isChecked, setIsChecked, isPressed, setIsPressed }}
    >
      <SwitchPrimitives.Root {...props} onCheckedChange={setIsChecked} asChild>
        <motion.button
          ref={ref}
          data-slot="switch"
          whileTap="tap"
          initial={false}
          onTapStart={() => setIsPressed(true)}
          onTapCancel={() => setIsPressed(false)}
          onTap={() => setIsPressed(false)}
          {...motionProps}
        />
      </SwitchPrimitives.Root>
    </SwitchProvider>
  );
});

Switch.displayName = 'Switch';

type SwitchThumbProps = Omit<
  React.ComponentProps<typeof SwitchPrimitives.Thumb>,
  'asChild'
> &
  HTMLMotionProps<'div'> & {
    pressedAnimation?:
      | TargetAndTransition
      | VariantLabels
      | boolean
      | LegacyAnimationControls;
  };

function SwitchThumb({
  pressedAnimation,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  ...props
}: SwitchThumbProps) {
  const { isChecked, isPressed } = useSwitch();
  const thumbX = isChecked ? 16 : 0;
  const isTargetAnimation =
    pressedAnimation &&
    typeof pressedAnimation === 'object' &&
    !Array.isArray(pressedAnimation) &&
    !('start' in pressedAnimation);

  return (
    <SwitchPrimitives.Thumb asChild>
      <motion.div
        data-slot="switch-thumb"
        whileTap="tap"
        layout
        transition={transition}
        {...props}
        animate={
          isPressed && isTargetAnimation
            ? { x: thumbX, ...pressedAnimation }
            : { x: thumbX }
        }
      />
    </SwitchPrimitives.Thumb>
  );
}

type SwitchIconPosition = 'left' | 'right' | 'thumb';

type SwitchIconProps = HTMLMotionProps<'div'> & {
  position: SwitchIconPosition;
};

function SwitchIcon({
  position,
  transition = { type: 'spring', bounce: 0 },
  ...props
}: SwitchIconProps) {
  const { isChecked } = useSwitch();

  const isAnimated = React.useMemo(() => {
    if (position === 'right') return !isChecked;
    if (position === 'left') return isChecked;
    if (position === 'thumb') return true;
    return false;
  }, [position, isChecked]);

  return (
    <motion.div
      data-slot={`switch-${position}-icon`}
      animate={isAnimated ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      transition={transition}
      {...props}
    />
  );
}

export {
  Switch,
  SwitchThumb,
  SwitchIcon,
  useSwitch,
  type SwitchProps,
  type SwitchThumbProps,
  type SwitchIconProps,
  type SwitchIconPosition,
  type SwitchContextType,
};
