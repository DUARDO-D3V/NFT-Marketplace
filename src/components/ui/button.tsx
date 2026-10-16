import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[10px] whitespace-nowrap rounded-md border border-transparent text-sm font-bold tracking-[.015em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-light)] disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-[#160d08] hover:bg-[var(--accent-light)]",
        destructive: "bg-[#9c4836] text-white hover:bg-[#b45b46]",
        outline: "border-[#62432d] bg-transparent text-[#dfb27e] hover:border-[var(--accent)] hover:bg-[rgba(218,145,76,0.07)]",
        secondary: "bg-[#21150f] text-[#f5eee7] hover:bg-[#2a1b14]",
        ghost: "border-transparent bg-transparent text-[#b9a58e] hover:bg-[rgba(218,145,76,0.07)]",
        link: "border-transparent bg-transparent p-0 text-[var(--accent-light)] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[43px] px-[19px] py-0",
        sm: "min-h-[35px] px-[14px] py-0 text-[11px]",
        lg: "min-h-[48px] px-6 py-0",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return <Component data-slot="button" className={cn(buttonVariants({ className, size, variant }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
