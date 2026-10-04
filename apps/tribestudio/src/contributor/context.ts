import { createContext } from 'react';
import type { WorkspaceData } from './types';
import type { ShellShared } from './workspace';
// Stable context identities while presentation modules refresh in development.
export const WorkspaceContext = createContext<WorkspaceData | null>(null);
export const SharedContext = createContext<ShellShared | null>(null);
