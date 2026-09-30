export type LabsStatus = 'prototype' | 'alpha' | 'beta' | 'graduated' | 'retired';
export type LabsAccess = 'public' | 'signed-in' | 'invited testers';
export type FeedbackStatus = 'submitted' | 'reviewing' | 'planned' | 'resolved' | 'closed';
export interface Experiment { id: string; slug: string; name: string; purpose: string; category: string; status: LabsStatus; access: LabsAccess; enabled: boolean; version: string; updatedAt: string; instructions: string; limitations: string; destination: string; destinationLabel: string; feedbackTypes: string[] }
export interface LabsSource { ref: string; kind: 'word' | 'expression' | 'sentence' | 'culture' | 'literature'; original: string; meaning: string; context: string; attribution: string; topic: string; reviewed: true; revision: string; url: string; audioUrl: string }
export interface PracticeQuestion { id: string; mode: 'meaning' | 'matching' | 'listening'; prompt: string; choices: string[]; answer: number; source: LabsSource }
export interface PracticeSession { id: string; uid: string; experimentId: string; version: string; topic: string; questions: PracticeQuestion[]; answers: number[]; score: number; createdAt: string; completedAt: string | null }
export interface StoryDraft { id: string; uid: string; experimentId: string; version: string; title: string; audience: string; length: string; format: string; context: string; creative: string; sources: LabsSource[]; revision: number; createdAt: string; updatedAt: string }
export interface LabsFeedback { id: string; uid: string; experimentId: string; version: string; type: string; reference: string; description: string; steps: string; contactConsent: boolean; status: FeedbackStatus; response: string; createdAt: string; updatedAt: string }
export interface LabsUpdate { id: string; experimentId: string; version: string; title: string; body: string; createdAt: string }
export interface LabsAudit { id: string; actorUid: string; action: string; targetId: string; occurredAt: string }
export const LABS_REGISTRY: readonly Experiment[];
