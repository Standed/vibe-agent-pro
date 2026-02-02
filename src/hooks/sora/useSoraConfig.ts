/**
 * useSoraConfig
 * 
 * Sora 视频模型参数状态管理 Hook
 * 从 ChatPanel 提取，处理模型参数的联动校正
 */

import { useState, useEffect } from 'react';

export type SoraModel = 'sora-2' | 'sora-2-pro';
export type SoraAspectRatio = '16:9' | '9:16';
export type SoraDuration = 10 | 15 | 25;

export interface UseSoraConfigReturn {
    soraModel: SoraModel;
    setSoraModel: React.Dispatch<React.SetStateAction<SoraModel>>;
    soraAspectRatio: SoraAspectRatio;
    setSoraAspectRatio: React.Dispatch<React.SetStateAction<SoraAspectRatio>>;
    soraDuration: SoraDuration;
    setSoraDuration: React.Dispatch<React.SetStateAction<SoraDuration>>;
}

export function useSoraConfig(): UseSoraConfigReturn {
    const [soraModel, setSoraModel] = useState<SoraModel>('sora-2');
    const [soraAspectRatio, setSoraAspectRatio] = useState<SoraAspectRatio>('16:9');
    const [soraDuration, setSoraDuration] = useState<SoraDuration>(10);

    // 自动校正 duration：sora-2-pro 最小 15s，sora-2 最大 15s
    useEffect(() => {
        if (soraModel === 'sora-2-pro' && soraDuration === 10) {
            setSoraDuration(15);
        }
        if (soraModel === 'sora-2' && soraDuration === 25) {
            setSoraDuration(15);
        }
    }, [soraModel, soraDuration]);

    return {
        soraModel,
        setSoraModel,
        soraAspectRatio,
        setSoraAspectRatio,
        soraDuration,
        setSoraDuration,
    };
}
