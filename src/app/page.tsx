'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Film } from 'lucide-react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useI18n } from '@/components/providers/I18nProvider';
import NewProjectDialog from '@/components/project/NewProjectDialog';
import { useProjectStore } from '@/store/useProjectStore';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const { createNewProject } = useProjectStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  const handleCreateProject = (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => {
    createNewProject(title, description, artStyle, aspectRatio);
    setShowNewProjectDialog(false);
    // Navigate to the project editor
    router.push('/project/new');
  };

  return (
    <main className="min-h-screen bg-light-bg dark:bg-cine-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <Image
                  src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                  alt="西羊石AI视频"
                  width={48}
                  height={48}
                  className="h-12 w-auto object-contain"
                />
                <h1 className="text-4xl font-bold text-light-text dark:text-white">
                  {t('common.appName')}
                </h1>
              </div>
              <p className="text-light-text-muted dark:text-cine-text-muted text-lg">
                西羊石 AI 影视创作工具
              </p>
            </div>
            {/* Settings Button */}
            <SettingsPanel />
          </div>
        </header>

        {/* Create New Project Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowNewProjectDialog(true)}
            className="inline-flex items-center gap-2 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-black px-6 py-3 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors"
          >
            <Plus size={20} />
            {t('home.createProject')}
          </button>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Empty State */}
          <div className="col-span-full text-center py-20 border-2 border-dashed border-light-border dark:border-cine-border rounded-lg">
            <Film size={48} className="mx-auto mb-4 text-light-text-muted dark:text-cine-text-muted" />
            <h3 className="text-xl font-bold mb-2 text-light-text dark:text-white">
              {t('home.noProjects')}
            </h3>
            <p className="text-light-text-muted dark:text-cine-text-muted mb-4">
              {t('home.noProjectsDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          onConfirm={handleCreateProject}
          onClose={() => setShowNewProjectDialog(false)}
        />
      )}
    </main>
  );
}
