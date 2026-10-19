import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning'
  size?: 'sm' | 'default' | 'lg'
  loading?: boolean
}

const variants = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  outline: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-900',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
}
const sizes = { sm: 'px-3 py-1.5 text-sm', default: 'px-4 py-2', lg: 'px-6 py-3' }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={loading || disabled}
        {...props}
      >
        {loading && <span className="mr-2 animate-spin -ml-1">⟳</span>}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
