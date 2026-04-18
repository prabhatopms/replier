import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-indigo-100 text-indigo-700',
        blue: 'bg-blue-50 text-blue-700',
        purple: 'bg-purple-50 text-purple-700',
        green: 'bg-green-50 text-green-700',
        amber: 'bg-amber-50 text-amber-700',
        red: 'bg-red-50 text-red-600',
        gray: 'bg-gray-100 text-gray-600',
        outline: 'border border-gray-200 text-gray-600',
      },
    },
    defaultVariants: {
      variant: 'gray',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
