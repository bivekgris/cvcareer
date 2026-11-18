export type Experience = { id:string; role:string; company:string; dates:string; bullets:string };
export type Resume = {name:string; headline:string; email:string; phone:string; location:string; summary:string; skills:string; education:string; experiences:Experience[]};
export const templates = ['classic', 'modern', 'minimal'] as const;
export type Template = typeof templates[number];
export type Draft = { resume: Resume; template: Template };

export const emptyResume: Resume = {
  name: '', headline: '', email: '', phone: '', location: '', summary: '',
  skills: '', education: '', experiences: [],
};

export function isResume(value: unknown): value is Resume {
  if (!value || typeof value !== 'object') return false;
  const resume = value as Resume;
  const fields = ['name', 'headline', 'email', 'phone', 'location', 'summary', 'skills', 'education'] as const;
  const ids = new Set<string>();
  return fields.every(field => typeof resume[field] === 'string') &&
    Array.isArray(resume.experiences) && resume.experiences.every(experience => {
      if (!experience || typeof experience.id !== 'string' || !experience.id || ids.has(experience.id)) return false;
      ids.add(experience.id);
      return [experience.role, experience.company, experience.dates, experience.bullets].every(field => typeof field === 'string');
    });
}

export function readDraft(value: unknown): Draft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Draft;
  if (!isResume(draft.resume)) return null;
  return { resume: draft.resume, template: templates.includes(draft.template) ? draft.template : 'classic' };
}
export const seedResume:Resume = {name:'Alex Morgan',headline:'IT Support Specialist',email:'alex.morgan@email.com',phone:'+61 400 000 000',location:'Perth, WA',summary:'Detail-oriented IT support professional experienced in helping users resolve technical issues and keeping systems running smoothly. Skilled in troubleshooting, customer service, and clear technical communication.',skills:'Microsoft 365, Active Directory, Windows 11, Troubleshooting, Customer Service, Networking',education:'Bachelor of Information Technology · 2022',experiences:[{id:'exp-1',role:'IT Support Officer',company:'Northstar Solutions',dates:'2023 – Present',bullets:'Resolved hardware and software issues for end users\nAssisted with Microsoft 365 account support\nDocumented incidents and communicated solutions'},{id:'exp-2',role:'Service Desk Assistant',company:'Brightwave Tech',dates:'2021 – 2023',bullets:'Supported end-user requests and escalated complex issues\nMaintained accurate service desk documentation'}]};
