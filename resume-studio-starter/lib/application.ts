import type { Resume } from './types';

export type Application = {
  summary: string;
  skills: string;
  experience: { id: string; bullets: string }[];
  matchedKeywords: string[];
  coverLetter: string;
};

export function isApplication(value: unknown): value is Application {
  if (!value || typeof value !== 'object') return false;
  const application = value as Application;
  return [application.summary, application.skills, application.coverLetter].every(field => typeof field === 'string') &&
    Array.isArray(application.matchedKeywords) && application.matchedKeywords.every(word => typeof word === 'string') &&
    Array.isArray(application.experience) && application.experience.every(entry =>
      entry && typeof entry.id === 'string' && typeof entry.bullets === 'string');
}

export function applyApplication(resume: Resume, application: Application): Resume {
  const changes = new Map(application.experience.map(entry => [entry.id, entry.bullets]));
  return {
    ...resume,
    summary: application.summary,
    skills: application.skills,
    experiences: resume.experiences.map(entry => ({
      ...entry,
      bullets: changes.get(entry.id) ?? entry.bullets,
    })),
  };
}

export function sampleApplication(resume: Resume, job: string): Application {
  const jobText = job.toLowerCase();
  const skills = resume.skills.split(',').map(skill => skill.trim()).filter(Boolean);
  const matches = skills.filter(skill => jobText.includes(skill.toLowerCase()));
  const otherSkills = skills.filter(skill => !matches.includes(skill));
  const summary = resume.summary.trim() || [resume.headline, matches.join(', ')].filter(Boolean).join('. ');
  const letter = [
    'Dear Hiring Manager,',
    'I am writing to express my interest in the advertised position.',
    summary,
    matches.length ? `Skills I would bring to the role include ${matches.join(', ')}.` : '',
    'Thank you for considering my application.',
    `Kind regards,\n${resume.name}`,
  ];

  return {
    summary,
    skills: [...matches, ...otherSkills].join(', '),
    experience: [],
    matchedKeywords: matches,
    coverLetter: letter.filter(Boolean).join('\n\n'),
  };
}
