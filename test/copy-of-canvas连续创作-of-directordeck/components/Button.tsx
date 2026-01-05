import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isActive?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isActive = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-mono font-medium transition-all duration-300 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider";
  
  const variants = {
    primary: "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50 backdrop-blur-sm",
    secondary: "bg-transparent text-zinc-500 hover:text-zinc-200 border border-dashed border-zinc-800 hover:border-zinc-600",
    ghost: "bg-transparent text-zinc-500 hover:text-white hover:bg-white/5",
    accent: "bg-cine-accent text-black font-bold hover:brightness-110 shadow-[0_0_15px_-3px_rgba(201,255,86,0.3)] hover:shadow-[0_0_20px_rgba(201,255,86,0.5)] border border-cine-accent",
    icon: "bg-transparent text-zinc-500 hover:text-white hover:bg-white/10 rounded-full"
  };

  const activeStyles = isActive ? "bg-zinc-700 text-white border-zinc-500 shadow-inner ring-1 ring-cine-accent/20" : "";
  
  const sizes = {
    sm: "text-[9px] px-3 py-1.5 rounded-sm",
    md: "text-[10px] px-4 py-2 rounded-[2px]",
    lg: "text-xs px-6 py-3 rounded-md",
    icon: "p-2 rounded-md"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${activeStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};