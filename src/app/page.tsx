import Link from 'next/link';
import Image from 'next/image';
import { Plus, Film } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-cine-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-4 mb-2">
            <Image
              src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
              alt="西羊石AI视频"
              width={48}
              height={48}
              className="h-12 w-auto object-contain"
            />
            <h1 className="text-4xl font-bold">Vibe Agent Pro</h1>
          </div>
          <p className="text-cine-text-muted text-lg">西羊石 AI 影视创作工具</p>
        </header>

        {/* Create New Project Button */}
        <div className="mb-8">
          <Link
            href="/project/new"
            className="inline-flex items-center gap-2 bg-cine-accent text-cine-black px-6 py-3 rounded-lg font-bold hover:bg-cine-accent/90 transition-colors"
          >
            <Plus size={20} />
            创建新项目
          </Link>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Empty State */}
          <div className="col-span-full text-center py-20 border-2 border-dashed border-cine-border rounded-lg">
            <Film size={48} className="mx-auto mb-4 text-cine-text-muted" />
            <h3 className="text-xl font-bold mb-2">还没有项目</h3>
            <p className="text-cine-text-muted mb-4">
              点击上方按钮创建你的第一个 AI 影视项目
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
