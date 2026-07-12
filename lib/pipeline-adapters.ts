export type IntermediateDocument = {
  markdown: string;
  language?: string;
};

export type TranslationRequest = {
  document: IntermediateDocument;
  targetLanguage: "he" | string;
  sourceLanguage?: string;
};

export type TranslationAdapter = {
  translate(request: TranslationRequest): Promise<IntermediateDocument>;
};

export type EpubValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type EpubValidationAdapter = {
  validate(epubPath: string): Promise<EpubValidationResult>;
};

export const passthroughTranslationAdapter: TranslationAdapter = {
  async translate(request) {
    return request.document;
  },
};

export const epubValidationNotConfigured: EpubValidationAdapter = {
  async validate() {
    return {
      ok: false,
      errors: ["EpubCheck is not configured yet."],
      warnings: [],
    };
  },
};
