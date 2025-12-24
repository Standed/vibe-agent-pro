
import * as XLSX from 'xlsx';
import { RunningHubService } from './RunningHubService';
import { StoryboardService } from './StoryboardService';
import { SoraParams, SoraScript } from '@/types/runninghub';

export interface BatchTaskRow {
    Prompt: string;
    Ratio?: string;
    Duration?: number;
    ImageUrl?: string;
}

export interface BatchProgress {
    total: number;
    submitted: number;
    failed: number;
    results: Array<{ row: number; taskId?: string; error?: string }>;
}

export class BatchService {
    private runningHub: RunningHubService;
    private storyboard: StoryboardService;

    constructor(apiKey?: string) {
        this.runningHub = new RunningHubService(apiKey);
        this.storyboard = new StoryboardService();
    }

    async parseExcel(fileBuffer: ArrayBuffer): Promise<BatchTaskRow[]> {
        const workbook = XLSX.read(fileBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json<BatchTaskRow>(sheet);
    }

    async processBatch(rows: BatchTaskRow[], onProgress?: (progress: BatchProgress) => void): Promise<BatchProgress> {
        const progress: BatchProgress = {
            total: rows.length,
            submitted: 0,
            failed: 0,
            results: []
        };

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                // Smart Script Handling:
                // 1. Try parse as JSON
                // 2. If fail, use AI to generate Script from text

                let scriptData: SoraScript;
                try {
                    scriptData = JSON.parse(row.Prompt);
                } catch {
                    console.log(`[Batch] Row ${i + 1}: Converting text prompt to Sora Script...`);
                    scriptData = await this.storyboard.generateScript(row.Prompt);
                }

                const params: SoraParams = {
                    aspect_ratio: (row.Ratio as any) || 'landscape', // simplified cast
                    duration: (row.Duration as any) || 15,
                    image_url: row.ImageUrl
                };

                const result = await this.runningHub.submitTask(scriptData, params);

                progress.submitted++;
                progress.results.push({ row: i + 1, taskId: result.taskId });

            } catch (error: any) {
                console.error(`Batch Row ${i + 1} Failed:`, error);
                progress.failed++;
                progress.results.push({ row: i + 1, error: error.message });
            }

            if (onProgress) onProgress({ ...progress });
        }

        return progress;
    }
}
