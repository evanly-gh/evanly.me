/**
 * Single editable source of truth for all in-world and post-hero copy.
 * Every image is a placeholder slot (src: null) until real photography/screenshots
 * are dropped in — see src/content/placeholders.ts for the rendered texture.
 */

export interface ImageSlot {
  src: string | null;
  w: number;
  h: number;
  label: string;
}

export interface Project {
  title: string;
  stack: string;
  blurb: string;
  image: ImageSlot;
}

export interface TimelineEntry {
  role: string;
  org: string;
  period: string;
  detail?: string;
}

export interface Resume {
  name: string;
  tagline: string;
  about: {
    paragraph: string;
    heroTagline: [string, string];
    heroBlurb: string;
    faceImage: ImageSlot;
    misc: [ImageSlot, ImageSlot];
  };
  projects: [Project, Project, Project, Project];
  research: [Project, Project, Project];
  education: {
    school: string;
    degrees: string[];
    honors: string;
    graduation: string;
    gpa: string;
    coursework: string[];
  };
  skills: Record<string, string[]>;
  experience: TimelineEntry[];
  achievements: string[];
  contact: { email: string; linkedin: string; github: string };
}

export const RESUME: Resume = {
  name: 'Evan Li',
  tagline: 'CS + Economics @ UW — ML Systems / On-Device Inference',

  about: {
    paragraph:
      'Evan Li is a CS + Economics student at the University of Washington ' +
      '(Interdisciplinary Honors, 3.9 GPA, graduating June 2027). He builds ML ' +
      'systems that stay fast under tight memory budgets — LLM inference ' +
      'optimization, on-device model compression, and RL post-training. He ' +
      'researches phone-sized language models at UW’s Mobile Intelligence Lab, ' +
      'is a founding developer of KleoKlaw (an AI job-application platform serving ' +
      '~100 users), and is CTO of UW’s Software Engineering Career Club. A ' +
      'former national-championship debater, he likes turning hard research ideas ' +
      'into systems that actually ship.',
    heroTagline: ['CS + ECON @ UW', 'ML SYSTEMS · ON-DEVICE INFERENCE'],
    heroBlurb:
      'UW CS + Econ student building efficient ML for on-device systems.',
    faceImage: {
      src: '/images/about/about-portrait-placeholder.webp',
      w: 1024,
      h: 1536,
      label: 'ANONYMOUS ABOUT PORTRAIT PLACEHOLDER',
    },
    misc: [
      { src: null, w: 800, h: 600, label: 'ABOUT MISC 1' },
      { src: null, w: 800, h: 600, label: 'ABOUT MISC 2' }
    ]
  },

  projects: [
    {
      title: 'RememberMe',
      stack: 'PyTorch · ResNet-50 · FastAPI · pgvector',
      blurb:
        'A mobile app for remembering the people you meet — capture a face and a ' +
        'six-model computer-vision pipeline derives descriptive attributes, then ' +
        'searches your contacts by memory with pgvector. As team lead I trained the ' +
        'ResNet-50 attractiveness regressor to Pearson r ≈ 0.88 (near state of the ' +
        'art) and published it to Hugging Face.',
      image: { src: null, w: 984, h: 912, label: 'REMEMBERME' }
    },
    {
      title: 'OpenChinese',
      stack: 'React Native · Expo · Supabase · Gemini',
      blurb:
        'A shipped Chinese-learning app built on a from-scratch SM-2 ' +
        'spaced-repetition engine with offline-first cloud sync. Its AI tutor ' +
        'assembles each prompt live from your weakest cards and active grammar ' +
        'through a JWT-gated Gemini edge function — real context engineering over ' +
        '2,400 HSK cards, not a chatbot wrapper.',
      image: { src: null, w: 1280, h: 714, label: 'OPENCHINESE' }
    },
    {
      title: 'RhetBench',
      stack: 'Python · FastAPI · LLM Evals',
      blurb:
        'A persuasion benchmark for LLM agents: the agent must shift a scripted ' +
        'character’s hidden belief within 25 turns, inferring which of six argument ' +
        'types actually moves them — theory-of-mind under partial observability on a ' +
        'deterministic, fully replayable NPC state machine. Solo overall winner of ' +
        'SWECCATHON 2026.',
      image: { src: null, w: 940, h: 964, label: 'RHETBENCH' }
    },
    {
      title: 'TTT-E2E',
      stack: 'PyTorch · HF Transformers · MAML',
      blurb:
        'Second-order meta-learning (MAML) that adapts a language model at test ' +
        'time, using a dual-branch trainable + frozen design. Evaluated across a ' +
        'four-method harness — baseline, in-context learning, RAG, and test-time ' +
        'training — to measure when on-the-fly adaptation actually beats retrieval.',
      image: { src: null, w: 1280, h: 574, label: 'TTT-E2E' }
    }
  ],

  research: [
    {
      title: 'SLM Factory',
      stack: 'LangGraph · PEFT/LoRA · llama.cpp · vLLM',
      blurb:
        'An agentic pipeline that autonomously fine-tunes a phone-sized language ' +
        'model for any task — task analysis, data curation, and a closed-loop LoRA ' +
        'search across an 18-variant Qwen3.5 pool under real RAM and quantization ' +
        'limits. It lifted biomedical NER span-F1 from 0.03 to 0.86 and delivers a ' +
        'fully optimized on-device model for about $5 and a day of compute.',
      image: { src: null, w: 1280, h: 720, label: 'SLM FACTORY' }
    },
    {
      title: 'RL on HRM-Text',
      stack: 'PyTorch · PEFT · RLVR (GRPO/DAPO)',
      blurb:
        'From-scratch RL post-training (SFT → DAPO) on a 1.1B double-recurrent ' +
        'reasoning model that no existing RL library supports. I led the RL ' +
        'workstream and hand-wrote both training loops, raising MATH pass@1 from ' +
        '64.4% to 66.7% and characterizing how RL’s sharpening gains plateau at ' +
        'small scale.',
      image: { src: null, w: 1280, h: 720, label: 'RL ON HRM-TEXT' }
    },
    {
      title: 'SD on Qwen',
      stack: 'vLLM · CUDA · Prometheus · SLURM',
      blurb:
        'A rigorous speculative-decoding study on the Qwen3.5 family, sweeping ' +
        'speculative depth and batch size on multi-GPU vLLM. It reached 2.88× ' +
        'decode throughput (up to 2.95× on the MoE model) and found that thinking ' +
        'mode roughly doubles the speedup, driven by longer chain-of-thought ' +
        'outputs and KV-cache reuse.',
      image: { src: null, w: 1280, h: 720, label: 'SD ON QWEN' }
    }
  ],

  education: {
    school: 'University of Washington',
    degrees: ['B.S. Computer Science', 'B.S. Economics'],
    honors: 'Interdisciplinary Honors Program',
    graduation: 'Expected June 2027',
    gpa: '3.9',
    coursework: ['Deep Learning', 'Data Structures & Parallelism', 'HW/SW Interface', 'Statistical Methods']
  },

  skills: {
    Languages: ['Python', 'TypeScript', 'JavaScript', 'Java', 'C/C++', 'SQL'],
    'ML Frameworks': [
      'PyTorch',
      'HuggingFace Transformers',
      'scikit-learn',
      'OpenCV',
      'MediaPipe',
      'CLIP',
      'SegFormer'
    ],
    Techniques: [
      'Fine-tuning',
      'Meta-learning (MAML/TTT)',
      'RAG',
      'Zero-shot classification',
      'GGUF quantization',
      'Evals design',
      'Vector search'
    ],
    Infrastructure: [
      'FastAPI',
      'Docker',
      'AWS',
      'Supabase',
      'pgvector',
      'llama.cpp',
      'Git',
      'HuggingFace Spaces'
    ],
    'AI Dev Tools': ['Cursor', 'Claude Code', 'GitHub Copilot']
  },

  experience: [
    {
      role: 'Undergraduate Researcher',
      org: 'Mobile Intelligence Lab, University of Washington',
      period: 'Spring 2026 – Present',
      detail:
        'microLLM research under the MAM project — model compression and ' +
        'on-device inference for mobile/edge, advised by Wen Cheng.'
    },
    {
      role: 'Associate',
      org: 'Panera Bread',
      period: 'Jun–Dec 2023 · Jun–Aug 2025',
      detail: 'Issaquah, WA'
    },
    {
      role: 'Retail Associate',
      org: 'Ross Dress For Less',
      period: 'Jun–Sep 2023',
      detail: 'Issaquah, WA'
    }
  ],

  achievements: [
    "Bellevue College Hackathon — 2nd Place (2024)",
    'DubHacks 2025 — Growth Track Competitor',
    'UW Interdisciplinary Honors Program',
    "Dean's List — Autumn 2025, Winter 2026"
  ],

  contact: {
    email: 'evanly@uw.edu',
    linkedin: 'linkedin.com/in/evanhly',
    github: 'github.com/evanly-gh'
  }
};
