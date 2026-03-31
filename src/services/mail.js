import { acquireToken } from '../auth.js';

const graphBase = 'https://graph.microsoft.com/v1.0';
const DIRECT_ATTACHMENT_LIMIT = 3 * 1024 * 1024;

const normalizeMailError = (status, detail) => {
  const normalized = (detail || '').toLowerCase();

  if (
    normalized.includes('mailbox') ||
    normalized.includes('mail box') ||
    normalized.includes('resource could not be discovered') ||
    normalized.includes('does not have a mailbox') ||
    normalized.includes('cannot find mailbox')
  ) {
    return 'Sua conta não possui caixa de correio habilitada para criar rascunhos no Outlook.';
  }

  if (status === 403) {
    return 'Sua conta não possui permissão para criar rascunhos de e-mail neste ambiente.';
  }

  return detail || `Falha ao criar rascunho do Outlook (${status})`;
};

const toBase64 = async (blob) => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const createQuoteDraft = async ({ to, subject, body, bodyHtml, pdfBlob, pdfFilename }) => {
  const token = await acquireToken();
  const attachments = [];

  if (pdfBlob) {
    if (pdfBlob.size > DIRECT_ATTACHMENT_LIMIT) {
      throw new Error('O PDF excede o limite de 3 MB para anexo direto no Outlook Web.');
    }

    attachments.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: pdfFilename || 'Orcamento.pdf',
      contentType: 'application/pdf',
      contentBytes: await toBase64(pdfBlob),
    });
  }

  const response = await fetch(`${graphBase}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      body: {
        contentType: bodyHtml ? 'HTML' : 'Text',
        content: bodyHtml || body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
      ...(attachments.length ? { attachments } : {}),
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || '';
    } catch {
      detail = '';
    }
    throw new Error(normalizeMailError(response.status, detail));
  }

  return response.json();
};
