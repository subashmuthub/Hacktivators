export type ModuleType = 'text' | 'quiz';

export interface Module {
    id: string;
    title: string;
    type: ModuleType;
    content: string; // Markdown content OR Quiz Concept
    quizConfig?: { count: number; difficulty: string };
    // For tracking student progress (runtime only, not stored in course def)
    completed?: boolean;
}

export interface Course {
    id: string;
    title: string;
    description: string;
    concept: string; // Main topic for Galaxy linkage
    modules: Module[];
    createdBy: string; // Email of the teacher
    createdAt: number;
}
