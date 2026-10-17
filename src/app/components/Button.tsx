"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "danger" | "success";
};

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "molim-button-primary",
    secondary: "molim-button-secondary",
    outline: "molim-button-outline",
    danger: "molim-button-danger",
    success: "molim-button-success",
  };

  return (
    <button
      {...props}
      className={`min-h-[44px] ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}