import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { faqLookup } from "../content/faq";
import { findSpecialist } from "../content/specialists";
import { getProject, searchProjects } from "../search/search";
import type { ProjectCard } from "../types";

type Tool = Anthropic.Beta.BetaTool;

export const TOOLS: Tool[] = [
  {
    name: "search_projects",
    description:
      "Search active JustServe.org projects in the pilot area. Pass the person's request in their own words as `query` (include place, dates, ages, group size, and the kind of service if they gave them). Returns up to 5 projects with tags and JustServe.org URLs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the person is looking for, in natural language" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_project",
    description: "Get the full stored listing text for one project by its id. Use this before answering detailed questions about a project.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "faq_lookup",
    description: "Look up JustServe how-to and policy questions in the approved FAQ. Returns matching Q&A entries, or an empty list if the FAQ doesn't cover it.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "find_specialist",
    description: "Find the local JustServe specialist for a city or stake. Contact details are included only when the specialist agreed to share them.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { city_or_stake: { type: "string" } },
      required: ["city_or_stake"],
      additionalProperties: false,
    },
  },
  {
    name: "end_conversation",
    description: "End this conversation. Use only when the user is under 18, after replying kindly.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", enum: ["under_18"] } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

const Inputs = {
  search_projects: z.object({ query: z.string() }),
  get_project: z.object({ id: z.string() }),
  faq_lookup: z.object({ question: z.string() }),
  find_specialist: z.object({ city_or_stake: z.string() }),
  end_conversation: z.object({ reason: z.literal("under_18") }),
};

export interface ToolContext {
  sessionId: string;
  seenProjects: Map<string, ProjectCard>;
  ended: boolean;
}

/** Runs one tool call and returns its JSON result. Throws on bad input so the caller can return is_error. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "search_projects": {
      const { query } = Inputs.search_projects.parse(input);
      const result = await searchProjects({ q: query, limit: 5, sessionId: ctx.sessionId, channel: "chat" });
      for (const p of result.projects) ctx.seenProjects.set(p.id, p);
      return {
        understood_as: result.parsed,
        radius_miles: result.radiusMiles,
        projects: result.projects.map((p) => ({
          id: p.id,
          url: p.url,
          title: p.title,
          org: p.orgName,
          city: p.city,
          starts_at: p.startsAt,
          ends_at: p.endsAt,
          recurring: p.recurring,
          distance_miles: p.distanceMiles,
          summary: p.summary,
          tags: p.tags,
        })),
      };
    }
    case "get_project": {
      const { id } = Inputs.get_project.parse(input);
      return (await getProject(id)) ?? { error: "No project with that id." };
    }
    case "faq_lookup": {
      const { question } = Inputs.faq_lookup.parse(input);
      return { entries: faqLookup(question) };
    }
    case "find_specialist": {
      const { city_or_stake } = Inputs.find_specialist.parse(input);
      return findSpecialist(city_or_stake) ?? { error: "No specialist on file for that city or stake." };
    }
    case "end_conversation": {
      Inputs.end_conversation.parse(input);
      ctx.ended = true;
      return { ok: true };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
