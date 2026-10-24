/** Server-created access context. Request parameters never supply the shop scope. */
export type OwnerAccess = {userId?:string;shopId?:string|null;role:"owner"|"staff"};
export const ownerScope = (owner: OwnerAccess) => ({shopId:owner.shopId??null});
export const sameShop = (owner: OwnerAccess, record: {shopId?:string|null}) => (record.shopId??null)===(owner.shopId??null);
export const agentShop = (agent:{shopId?:string|null},record:{shopId?:string|null}) => (agent.shopId??null)===(record.shopId??null);
