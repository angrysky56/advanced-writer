import { JungianArchetype, PankseppSystem } from '../types/character.js';
import { DiagnosticProfile } from '../types/narrative.js';

export interface CharacterRecord {
  id: string;
  document: string; // full markdown profile
  metadata: {
    name: string;
    archetype: JungianArchetype | string;
    hamartia: string;
    shadow: string;
    moral_weakness: string;
    individuation_state: 'Pre-Awareness' | 'Awakening' | 'Confrontation' | 'Integration' | 'Transcendence' | string;
    role: string;
    panksepp_primary: PankseppSystem | string;
    story_ids: string[];
    created_at: string;
    updated_at: string;
  };
}

export interface StoryRecord {
  id: string;
  document: string;
  metadata: {
    title: string;
    genre: string;
    framework: string;
    designing_principle: string;
    status: 'planning' | 'drafting' | 'review' | 'complete' | string;
    character_ids: string[];
    created_at: string;
    updated_at: string;
  };
}

export interface SceneRecord {
  id: string;
  document: string;
  metadata: {
    story_id: string;
    act: string;
    sequence: number;
    cortisol_score: number;
    oxytocin_score: number;
    dopamine_score: number;
    diagnostic_profile: DiagnosticProfile | string;
    pathologies_detected: string[]; // serialized list of pathology types
    version: number;
    created_at: string;
  };
}

export interface ArchetypeRecord {
  id: string; // e.g. "the_hero"
  document: string; // full archetype reference
  metadata: {
    core_desire: string;
    core_strategy: string;
    primary_vulnerability: string;
    compatible_panksepp: string[]; // serialized
    shadow_archetypes: string[]; // serialized
  };
}
