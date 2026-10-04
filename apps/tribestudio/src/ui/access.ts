import { createContext, useContext } from 'react';

/**
 * Which workspaces the signed-in person can open, for the switcher. The
 * contributor portal is invitation-only, so it is offered once the
 * account's contributor record has been read as active; `null` means that
 * read has not happened (or the person is signed out).
 */
export interface WorkspaceAccess {
  contributor: boolean | null;
}

export const WorkspaceAccessContext = createContext<WorkspaceAccess>({ contributor: null });

export function useWorkspaceAccess(): WorkspaceAccess {
  return useContext(WorkspaceAccessContext);
}
