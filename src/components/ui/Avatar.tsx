import { cn } from '@/lib/utils';

export interface AvatarProps {
    src?: string | null;
    name?: string;
    email?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
};

export function Avatar({ src, name, email, size = 'md', className }: AvatarProps) {
    const displayName = name || email || 'User';
    const initial = displayName[0]?.toUpperCase() || 'U';

    return (
        <div className={cn(
            sizes[size],
            'rounded-full overflow-hidden ring-2 ring-white/10 flex-shrink-0',
            className
        )}>
            {src ? (
                <img
                    src={src}
                    alt={displayName}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                    {initial}
                </div>
            )}
        </div>
    );
}
