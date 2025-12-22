
export interface KaponaiResponse<T> {
    id: string;
    object: string;
    created_at: number;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'in_progress';
    model: string;
    prompt: string;
    progress: number;
    seconds: string | number;
    size: string;
    video_url?: string;
    error?: any;
    completed_at?: number;
    expires_at?: number;
}

export interface KaponaiCharacterResponse {
    id: string;
    username: string;
    permalink: string;
    profile_picture_url: string;
}

export interface KaponaiVideoParams {
    model: 'sora-2' | 'sora-2-pro';
    prompt: string | object;
    seconds: string | number;
    size: string;
    input_reference?: any; // File or Buffer
    character_url?: string;
    character_timestamps?: string;
    private?: string;
}

export interface KaponaiCharacterParams {
    url?: string;
    from_task?: string;
    timestamps?: string;
}
