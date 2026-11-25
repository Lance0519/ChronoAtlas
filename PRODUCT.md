# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript + Tailwind, per the project blueprint. Chosen by the project owner before this session.

## Users

One person exploring historical places and artifacts, starting with Philippine heritage. The user is browsing on a desktop most of the time and on a phone sometimes. They want to find a record, see where it sits on a map, read its sources, and keep private notes about places they have visited.

## Product Purpose

ChronoAtlas reveals spatial relationships between historical records. The map, discovery feed, and context drawer answer the same question from three angles: what happened here, where is it, and what does it connect to.

Success means a user can move from a search result to a location to a sourced relationship without losing their place, and can trust that unknown data is shown as unknown.

## Positioning

A map-first historical atlas with typed relationships and dual pins for relocated artifacts. A general encyclopedia can describe a site; ChronoAtlas shows how sites and artifacts relate in space.

## Operating Context

Desktop three-pane workspace, tablet with a collapsible drawer, phone with a map-first layout. Records are curated, not user-submitted. Imported Wikipedia content stays a draft until a human reviews it.

## Capabilities and Constraints

- React, Vite, TypeScript, Tailwind, Lucide, MapLibre GL JS with OpenFreeMap tiles, Vitest.
- No Mapbox, no paid map key, no service-role credential in browser code.
- Public historical records are separate from private progress and notes.
- Coordinates carry precision and source fields. Unknown stays unknown; no `[0,0]` fallback.
- Years use astronomical numbering; BCE/CE is a formatting concern.
- No local Supabase credentials in this session. The app runs on a bounded local seed dataset and keeps a service seam for Supabase.
- Scope of this pass: working vertical slice, not all ten blueprint phases.

## Evidence on Hand

`CHRONOATLAS_BLUEPRINT_V2.md` is the authoritative specification. Seed records are draft demonstrations built from public Wikipedia articles; each one carries its source URL and is marked unreviewed. No credentials, no deployed database, no production analytics, and no real user data are present.

## Product Principles

- Show the source beside the claim.
- An unknown value is better than a confident guess.
- One selected record, shared by every pane.
- The map is the primary navigation surface.
- Free-tier and open-source tooling by default.

## Accessibility & Inclusion

Visible keyboard focus, keyboard-operable controls and comparison slider, non-color-only map legend, reduced-motion support, and 44px minimum touch targets on small screens.
