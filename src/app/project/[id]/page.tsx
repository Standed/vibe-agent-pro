import { ProjectEditorClient } from './ProjectEditorClient';

// Required for static export
export async function generateStaticParams() {
  return [{ id: 'new' }];
}

export default function ProjectEditorPage() {
  return <ProjectEditorClient />;
}
