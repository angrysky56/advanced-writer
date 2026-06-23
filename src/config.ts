import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../.env"), quiet: true });

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  MODEL_GENERATION: z.string(),
  MODEL_DIAGNOSTIC: z.string(),
  MODEL_BRAINSTORM: z.string(),
  CHROMA_PERSIST_DIR: z.string().default("./data/chroma"),
  NEO4J_URI: z.string().default("bolt://localhost:7687"),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().optional().default(""), // Make optional for dev
  NEO4J_DATABASE: z.string().optional(),
  DEFAULT_MODE: z
    .enum(["brainstorm", "collaborative", "fast-auto"])
    .default("brainstorm"),
  NEUROCHEMICAL_PASS_THRESHOLD: z.coerce.number().default(7),
  MAX_REWRITE_ITERATIONS: z.coerce.number().default(3),
  MAX_PANKSEPP_ACTIVATIONS: z.coerce.number().default(2),
  MCP_TRANSPORT: z.enum(["stdio", "sse"]).default("stdio"),
  MCP_PORT: z.coerce.number().default(3100),
  WORKSPACE_DIR: z.string().default("./data/workspace"),
});

export const ENV = envSchema.parse(process.env);

export type EnvConfig = z.infer<typeof envSchema>;
