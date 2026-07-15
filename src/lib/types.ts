export type FlowStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BookType = 'ebook' | 'print' | 'kindle' | 'audiobook';

export type MessageRole = 'ai' | 'user';

export type MessageType = 'text' | 'structured' | 'direction-cards' | 'generating';

export interface AiStructuredContent {
  heading?: string;
  body: string;
  hasExample?: boolean;
  exampleText?: string;
  fallbackHeading?: string;
  fallbackBody?: string;
  fallbackAction?: string;
  progressHint?: string;
  voiceHeading?: string;
  voiceText?: string;
  backgroundHeading?: string;
  backgroundText?: string;
  directionsIntro?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  type: MessageType;
  structured?: AiStructuredContent;
}

export interface BookDirection {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  emoji: string;
  bestFor: string;
  vibe: string;
  whyThisWorks: string;
}

export interface SubChapter {
  id: string;
  title: string;
  description: string;
}

export interface ChapterOutline {
  id: string;
  number: number;
  title: string;
  description: string;
  subChapters: SubChapter[];
  pageRange?: string;
}

export interface BookOutline {
  title: string;
  subtitle: string;
  chapters: ChapterOutline[];
  totalPages?: number;
}

export interface BookChapterContent {
  id: string;
  number: number;
  title: string;
  content: string;
}

export interface GeneratedBook {
  title: string;
  subtitle: string;
  chapters: BookChapterContent[];
}

export interface ExampleCard {
  id: string;
  label: string;
  text: string;
}

export interface UserResponses {
  aboutYourself?: string;
  uniqueApproach?: string;
  yourStory?: string;
  selectedDirection?: string;
}

export interface StepConfig {
  number: number;
  label: string;
  totalSteps: number;
}

export interface FlowState {
  currentStep: FlowStep;
  messages: ChatMessage[];
  userResponses: UserResponses;
  selectedDirection: BookDirection | null;
  generatedOutline: BookOutline | null;
  generatedBook: GeneratedBook | null;
  isAiTyping: boolean;
  isTransitioning: boolean;
  transitionType: 'outline' | 'book';
  showChat: boolean;
  selectedBookType: BookType | null;
  showBookTypeSelector: boolean;
  outlineWelcomeSent: boolean;
  sidebarOpen: boolean;
  isImporting: boolean;
  showAccount: boolean;
  profilePhoto: string | null;
}
