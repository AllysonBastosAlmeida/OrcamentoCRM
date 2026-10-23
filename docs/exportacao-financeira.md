# Exportação financeira

O botão em Orçamentos lê o arquivo completo configurado por `VITE_GRAPH_DRIVE_ID_ORCAMENTOS` (ou `VITE_GRAPH_DRIVE_ID`) e `VITE_GRAPH_ITEM_ORCAMENTOS`. A exportação não depende dos filtros, paginação, cache ou normalização de status de `useQuotes`. Não grava dados, não atualiza status e não emite notas.

`financialExtraction.js` preserva os campos de tabela e JSON, mantém ID do cliente separado do UUID do orçamento e usa PO de origem, nunca NF. Seleciona propostas elegíveis pela criação ou por eventos comprovados no período, incluindo propostas antigas com faturamento no ano. Rascunho contraditório com aprovação explícita é sinalizado; reprovação/cancelamento excluem o registro. Duplicidades por cliente/PO ficam nas inconsistências.

`financialEvidence.json` registra documentos efetivamente conferidos em 16/10/2026. Originais de projetos são lidos novamente e só recuperam uma composição quando PO, cliente, total e soma conciliam. PDFs de NF e resumos revisados são aceitos somente se o SHA-256 do arquivo atual coincidir com a evidência. Arquivos novos ou alterados exigem nova conferência e atualização desse manifesto; sem essa conferência, o relatório sinaliza ausência e não inventa valores. URLs temporárias de download e tokens ficam apenas em memória.

A aba mensal separa emissão fiscal, recebimento, aprovação e conclusão. As colunas por criação são explicitamente de formação de preço, não execução ou receita realizada. `Data_Pagamento` calculada por data-base mais prazo é previsão. Status Pago não gera valores recebidos. A fonte verificada não contém parcelas/comprovantes de recebimento; o extrato está vazio.

O custo interno de diária técnica de 125 e o preço de venda salvo, normalmente 215, permanecem separados. A função original `calculateQuoteProfitability` não foi alterada. Custos/resultados são estimativas e dependem da cobertura da composição. Serviços sem custo cadastrado seguem a regra existente do CRM, sem comprovar custo real zero. O acréscimo comercial de imposto já embutido na venda ocupa uma coluna diferente do imposto estimado como custo.

Em 16/10/2026 foram recuperadas composições conciliadas dos POs 71, 105, 106 e 82. O PO 87 tem preços de materiais ausentes; o PDF do PO 107 confirma apenas a composição agregada de venda, enquanto sua planilha tem total divergente. POs 49 e 80, incluídos por emissão em 2026, também têm versões antigas divergentes. Esses quatro registros continuam sem custo total/margem completos, explicitamente identificados.

Validação sem arquivos reais: `node --test scripts/financial-report.unit.test.mjs`.

Geração e conciliação com os arquivos reais baixados para `tmp`: `node scripts/financial-report.test.mjs [caminho-do-arquivo-fonte.xlsx]`. O script usa os originais `financial-original-{key}.xlsx`, PDFs `financial-nf-{index}.pdf` e `financial-po107.pdf`, conferindo os hashes do manifesto. Gera o Excel e o JSON de validação em `tmp`, sem alterar as fontes. Confere custos por PO, componentes de mão de obra, separação de impostos, NFs únicas, totais mensais por data e reabertura com ExcelJS/SheetJS. Microsoft Excel não está instalado no ambiente; não foi possível validar sua abertura via COM.
