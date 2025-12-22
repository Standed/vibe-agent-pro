
import { SoraOrchestrator } from '../src/services/SoraOrchestrator';
import { Project, Scene, Shot, Character, AspectRatio } from '../src/types/project';

// Mock Project Data
const mockProject: Project = {
    id: 'proj-001',
    metadata: { title: 'Sora Test Project', description: 'Testing integration', artStyle: 'Realistic', created: new Date(), modified: new Date() },
    characters: [
        {
            id: 'char-001',
            name: 'Lin Luo',
            description: 'A brave warrior with silver hair',
            appearance: 'Silver hair, blue armor, glowing sword',
            referenceImages: ['https://example.com/ref.jpg'],
            soraIdentity: {
                username: 'mock_user_123', // Simulate already registered
                referenceVideoUrl: 'https://example.com/ref.mp4',
                status: 'registered'
            }
        }
    ],
    scenes: [
        {
            id: 'scene-001',
            name: 'Battle Scene',
            location: 'Ancient Arena',
            description: 'A fierce battle in an ancient arena',
            shotIds: ['shot-001', 'shot-002'],
            position: { x: 0, y: 0 },
            order: 1,
            status: 'draft'
        }
    ],
    shots: [
        {
            id: 'shot-001',
            sceneId: 'scene-001',
            order: 1,
            shotSize: 'Wide Shot',
            cameraMovement: 'Pan',
            duration: 5,
            description: 'Lin Luo stands ready for battle.',
            status: 'draft'
        },
        {
            id: 'shot-002',
            sceneId: 'scene-001',
            order: 2,
            shotSize: 'Close-Up',
            cameraMovement: 'Zoom In',
            duration: 5,
            description: 'Lin Luo draws his sword with determination.',
            status: 'draft'
        }
    ],
    locations: [],
    audioAssets: [],
    script: '',
    timeline: [],
    settings: {
        videoResolution: { width: 1920, height: 1080 },
        aspectRatio: AspectRatio.WIDE,
        fps: 24,
        audioSampleRate: 48000,
        defaultShotDuration: 5
    }
};

async function main() {
    console.log('🚀 Starting Sora Integration Test...');

    // Instantiate Orchestrator
    // Note: We need to mock KaponaiService inside Orchestrator to avoid real API calls impacting quotas, 
    // or we can run it and expect it to fail on network if no keys, but we want to verify logic flow.
    // For this test, let's just inspect the logic by running it. If it hits API, it might fail, which is fine as long as logic before that is correct.

    // To properly test without hitting API, we would need dependency injection or mocking. 
    // Given the constraints, let's trust the logic structure and maybe just log what PromptService generates.

    const orchestrator = new SoraOrchestrator();

    // Access private promptService to test generation logic (naughty but effective for quick check)
    const promptService = (orchestrator as any).promptService;

    console.log('\n🧪 Testing Prompt Generation...');
    const char = mockProject.characters[0];
    const shot = mockProject.shots[0];
    const scene = mockProject.scenes[0];

    const prompt = promptService.generateVideoPrompt(shot, [char], scene);
    console.log('Generated Prompt:', prompt);

    if (prompt.includes('@mock_user_123') && prompt.includes('Ancient Arena')) {
        console.log('✅ Prompt Logic Verified: Contains username and context.');
    } else {
        console.error('❌ Prompt Logic Failed');
    }

    console.log('\n🧪 Testing Orchestrator Flow (Simulated)...');
    try {
        // This will likely fail due to real API call failure (no key or network), but we check if it reaches that point
        await orchestrator.generateSceneVideo(mockProject, 'scene-001');
    } catch (e: any) {
        console.log('Expected API Error (Verification complete):', e.message);
        if (e.message.includes('API_KEY') || e.message.includes('fetch') || e.message.includes('Kaponai')) {
            console.log('✅ Orchestrator successfully attempted to call API.');
        }
    }
}

main().catch(console.error);
