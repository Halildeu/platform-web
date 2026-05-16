'use client';
/* ------------------------------------------------------------------ */
/*  Enterprise — domain-specific showcase components                    */
/*                                                                      */
/*  Phase 2/3/4 moved every domain-agnostic building block to its        */
/*  canonical home (blocks/, components/, patterns/, utils/) and Phase 5  */
/*  removed the deprecated compat shims. The enterprise/ surface now      */
/*  contains only genuine domain-specific residents: FlowBuilder and      */
/*  FineKinney.                                                          */
/* ------------------------------------------------------------------ */

/* Process & Flow */
export { FlowBuilder } from './FlowBuilder';
export type { FlowBuilderProps, FlowNode, FlowEdge, FlowNodeType } from './FlowBuilder';

/* Fine-Kinney — Türkiye ISG (occupational health & safety) risk assessment */
export { FineKinney } from './domain/turkey-isg/FineKinney';
export type { FineKinneyProps, FineKinneyRisk } from './domain/turkey-isg/FineKinney';
