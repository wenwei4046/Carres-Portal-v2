import React from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional muted uppercase label rendered above the field. */
  label?: React.ReactNode;
  /** Render the value in JetBrains Mono (codes / PO / phone / SKU). */
  mono?: boolean;
}

/**
 * Standard Carres text field — white, hairline border, flame focus ring.
 * @startingPoint section="Core" subtitle="Labelled text field" viewport="360x90"
 */
export function TextInput(props: TextInputProps): JSX.Element;
