import { ShotSize, CameraMovement } from '@/types/project';

export const SHOT_SIZE_TRANSLATIONS: Record<ShotSize, string> = {
    'Extreme Wide Shot': '大远景',
    'Wide Shot': '全景',
    'Full Shot': '全景(人物)',
    'Medium Wide Shot': '中远景',
    'Medium Shot': '中景',
    'Medium Close-Up': '中特写',
    'Close-Up': '特写',
    'Extreme Close-Up': '大特写',
    'Low Angle Shot': '低角度',
    'High Angle Shot': '高角度',
    'Over the Shoulder Shot': '过肩镜头',
    'Point of View Shot': '主观镜头',
    'Bird\'s Eye View': '鸟瞰镜头',
    'Dutch Angle': '荷兰角',
    'Establishing Shot': '建立镜头',
    'Cowboy Shot': '牛仔镜头',
    'Eye Level Shot': '平视镜头',
    'Worm\'s Eye View': '虫眼视角',
    'Ground Level Shot': '地面镜头',
    'Aerial Shot': '航拍镜头',
    'Macro Shot': '微距镜头'
};

export const CAMERA_MOVEMENT_TRANSLATIONS: Record<CameraMovement, string> = {
    'Pan': '摇镜头',
    'Tilt': '俯仰镜头',
    'Dolly': '推拉镜头',
    'Zoom': '变焦',
    'Truck': '横移',
    'Pedestal': '升降',
    'Static': '固定镜头',
    'Pan Left': '左摇',
    'Pan Right': '右摇',
    'Tilt Up': '上摇',
    'Tilt Down': '下摇',
    'Dolly In': '推镜头',
    'Dolly Out': '拉镜头',
    'Zoom In': '变焦推',
    'Zoom Out': '变焦拉',
    'Truck Left': '左移',
    'Truck Right': '右移',
    'Pedestal Up': '升降上',
    'Pedestal Down': '升降下',
    'Handheld': '手持',
    'Arc': '环绕',
    'Crane': '摇臂',
    'Tracking Shot': '跟拍',
    'Steadicam': '斯坦尼康',
    'Rack Focus': '焦点转换',
    'Whip Pan': '甩镜头',
    'Push In': '推进',
    'Pull Out': '拉远',
    'Vertigo Effect': '希区柯克变焦'
};

export function translateShotSize(size: ShotSize): string {
    return SHOT_SIZE_TRANSLATIONS[size] || size;
}

export function translateCameraMovement(movement: CameraMovement): string {
    return CAMERA_MOVEMENT_TRANSLATIONS[movement] || movement;
}

export function getShotSizeFromValue(value: string): ShotSize | undefined {
    if (!value) return undefined;
    const v = value.trim();

    // 1. 尝试完全匹配 key (例如 'Close-Up')
    const keys = Object.keys(SHOT_SIZE_TRANSLATIONS) as ShotSize[];
    const matchByKey = keys.find(k => k.toLowerCase() === v.toLowerCase());
    if (matchByKey) return matchByKey;

    // 2. 尝试匹配中文翻译值 (例如 '特写')
    const entry = Object.entries(SHOT_SIZE_TRANSLATIONS).find(([_, label]) => label === v);
    if (entry) return entry[0] as ShotSize;

    return undefined;
}

export function getCameraMovementFromValue(value: string): CameraMovement | undefined {
    if (!value) return undefined;
    const v = value.trim();

    // 1. 尝试完全匹配 key (例如 'Pan')
    const keys = Object.keys(CAMERA_MOVEMENT_TRANSLATIONS) as CameraMovement[];
    const matchByKey = keys.find(k => k.toLowerCase() === v.toLowerCase());
    if (matchByKey) return matchByKey;

    // 2. 尝试匹配中文翻译值 (例如 '摇镜头')
    const entry = Object.entries(CAMERA_MOVEMENT_TRANSLATIONS).find(([_, label]) => label === v);
    if (entry) return entry[0] as CameraMovement;

    return undefined;
}
