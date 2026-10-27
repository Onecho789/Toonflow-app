import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

export default Router().get("/", async (_req, res) => {
  const providers = await u.mediaProvider.listMediaProviders();
  const usages = providers.flatMap(provider => {
    if (!("modelConnection" in provider) || !provider.modelConnection) return [];
    const references = provider.listedModels?.filter(model => model.imageProtocolId).map(model => ({
      protocolId: model.imageProtocolId!, providerId: provider.id, providerLabel: provider.label, modelId: model.id,
    })) ?? [];
    if (provider.imageProtocolId) references.unshift({ protocolId: provider.imageProtocolId, providerId: provider.id, providerLabel: provider.label, modelId: "" });
    return references;
  });
  res.json(success({ protocols: u.imageProtocols.getImageProtocols(), usages }));
});
