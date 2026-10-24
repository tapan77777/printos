"use client";
import {ownerAc,memberAc} from "better-auth/plugins/organization/access";
import {createAuthClient} from "better-auth/react";
import {organizationClient} from "better-auth/client/plugins";
export const accountClient=createAuthClient({basePath:"/api/account-auth",plugins:[organizationClient({roles:{owner:ownerAc,staff:memberAc}})]});
