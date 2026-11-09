BEGIN;
TRUNCATE TABLE "LiteLLM_SpendLogs", "LiteLLM_SpendLogToolIndex", "LiteLLM_SpendLogGuardrailIndex",
  "LiteLLM_DailyUserSpend", "LiteLLM_DailyTeamSpend", "LiteLLM_DailyOrganizationSpend",
  "LiteLLM_DailyEndUserSpend", "LiteLLM_DailyTagSpend", "LiteLLM_DailyToolSpend",
  "LiteLLM_DailyAgentSpend", "LiteLLM_DailyGlobalSpend", "LiteLLM_AutoRouterDailySpend",
  "LiteLLM_DailyModelUsage", "LiteLLM_DailyGatewayRequests", "LiteLLM_DailyGatewayFailedRequests",
  "LiteLLM_DailyRequestErrors", "LiteLLM_AutoRouterSession", "LiteLLM_AutoRouterUserSession";

UPDATE "LiteLLM_VerificationToken"           SET spend = 0, total_spend = 0, model_spend = '{}';
UPDATE "LiteLLM_TeamTable"                   SET spend = 0, model_spend = '{}';
UPDATE "LiteLLM_UserTable"                   SET spend = 0, model_spend = '{}';
UPDATE "LiteLLM_EndUserTable"                SET spend = 0;
UPDATE "LiteLLM_TeamMembership"              SET spend = 0, total_spend = 0;
UPDATE "LiteLLM_OrganizationTable"           SET spend = 0, model_spend = '{}';
UPDATE "LiteLLM_OrganizationMembership"      SET spend = 0;
UPDATE "LiteLLM_TagTable"                    SET spend = 0;
UPDATE "LiteLLM_ProjectTable"                SET spend = 0, model_spend = '{}';
UPDATE "LiteLLM_AgentsTable"                 SET spend = 0;
UPDATE "LiteLLM_ModelAccessGroupBudgetTable" SET spend = 0;
UPDATE "LiteLLM_ToolTable"                   SET call_count = 0, last_used_at = NULL;
COMMIT;

