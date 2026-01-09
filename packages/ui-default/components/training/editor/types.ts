import type { ProblemDoc } from 'hydrooj/src/interface';

export interface TrainingNode {
  _id: number;
  title: string;
  requireNids: number[];
  pids: (number | string)[];
}

export interface TrainingFormData {
  title: string;
  content: string;
  description: string;
  pin: number;
  dag: TrainingNode[];
}

export interface SectionItemData {
  id: string;
  node: TrainingNode;
}

export interface ProblemItemData {
  id: string;
  pid: number | string;
  pdoc?: ProblemDoc;
}

export const DND_TYPES = {
  SECTION: 'training-section',
  PROBLEM: 'training-problem',
} as const;
