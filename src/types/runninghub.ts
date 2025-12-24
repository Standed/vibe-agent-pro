export interface SoraParams {
    aspect_ratio?: 'portrait' | 'landscape' | 'portrait-hd' | 'landscape-hd'; // Mapped from "fieldValue"
    duration?: 10 | 15; // default 15
    image_url?: string; // For I2V input
}

export interface NodeInfo {
    nodeId: string;
    fieldName: string;
    fieldValue: string;
    fieldData?: string; // Optional metadata sometimes required
}

export interface RunningHubRunPayload {
    webappId: string;
    apiKey: string;
    nodeInfoList: NodeInfo[];
}

export interface RunningHubResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

// Strict JSON Schema for the "Prompt" field
export interface SoraScript {
    character_setting: {
        [name: string]: {
            age: number;
            appearance: string; // "Gender, Age, Hair, Clothes"
            name: string;
            voice: string; // "GenderAge PitchMean Tempo Accent"
        }
    };
    shots: Array<{
        action: string;
        camera: string;
        dialogue?: {
            role: string;
            text: string;
        };
        duration: number; // 0 for auto?
        location: string;
        style_tags: string;
        time: string; // "Day" | "Night"
        visual: string;
        weather: string;
    }>;
}

export interface TaskCreationResult {
    taskId: string; // RunningHub likely returns a taskId in generic response
    status?: string;
}

export interface TaskStatusResult {
    taskId: string;
    status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
    progress: number;
    result_url?: string;
    error_msg?: string;
}
