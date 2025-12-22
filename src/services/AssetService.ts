import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client if env vars are present
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export class AssetService {
    /**
     * Uploads a reference image for a Role.
     * In a real app, this would upload to S3/Supabase Storage.
     * Here we mock it or use Supabase if configured.
     */
    async uploadRoleImage(file: File, roleName: string): Promise<string> {
        if (!supabase) {
            console.warn('Supabase not configured. Mocking upload.');
            // Mock URL - In production this must be a real accessible URL for RunningHub
            return `https://mock-storage.com/${roleName}_${Date.now()}.png`;
        }

        try {
            const fileName = `${roleName}_${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage
                .from('role-assets')
                .upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('role-assets')
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            console.error('Asset Upload Failed:', error);
            throw new Error('Failed to upload role image');
        }
    }

    /**
     * Registers a role in the local database (Supabase table 'roles')
     */
    async registerRole(name: string, imageUrl: string, description?: string) {
        if (!supabase) return;

        const { error } = await supabase
            .from('roles')
            .insert({ name, image_url: imageUrl, description });

        if (error) throw error;
    }
}
