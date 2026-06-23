export type DiagnosticProfile =
  | "flatline"
  | "stress_no_empathy"
  | "pleasant_stagnant"
  | "action_no_soul"
  | "optimal";

export interface Pathology {
  type: string;
  description: string;
  location?: string;
}

export interface AgencyResult {
  activeCharacterCount: number;
  passiveCharacterCount: number;
  verdict: "pass" | "fail";
  issues: string[];
}

export interface DiagnosticResult {
  cortisol: number; // 1-10
  oxytocin: number; // 1-10
  dopamine: number; // 1-10
  profile: DiagnosticProfile;
  pathologies: Pathology[];
  agencyCheck: AgencyResult;
  pass: boolean;
  rewriteDirectives: string[];
}
