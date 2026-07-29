import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { WorkspaceProvider } from "@/lib/workspace/store";

export default function Home() {
  return (
    <WorkspaceProvider>
      <WorkspaceApp />
    </WorkspaceProvider>
  );
}
