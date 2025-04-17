import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

let nome_da_planilha = process.env.NOME_DA_PLANILHA;
const pasta_planilhas = process.env.PASTA_PLANILHAS;
let nome_da_sheet = process.env.NOME_DA_SHEET;
let cabecalhos_da_planilha = process.env.CABECALHOS_DA_PLANILHA;

/**
 * Verifica se os cabeçalhos da planilha correspondem aos cabeçalhos esperados
 * @param {Array} headers - Cabeçalhos encontrados na planilha
 * @param {string} expectedHeaders - Cabeçalhos esperados do .env
 * @returns {boolean} - True se os cabeçalhos correspondem, False caso contrário
 */
function verificarCabecalhos(headers, expectedHeaders) {
    if (!expectedHeaders) {
        console.log(expectedHeaders)
        console.warn('Cabeçalhos esperados não definidos no .env');
        return true;
    }

    const expectedHeadersArray = expectedHeaders.split(';').map(h => h.trim());
    const headersArray = headers.filter(h => h !== null && h !== undefined);

    if (headersArray.length !== expectedHeadersArray.length) {
        console.error(`Número de cabeçalhos incorreto. Esperado: ${expectedHeadersArray.length}, Encontrado: ${headersArray.length}`);
        return false;
    }

    for (let i = 0; i < expectedHeadersArray.length; i++) {
        if (headersArray[i] !== expectedHeadersArray[i]) {
            console.error(`Cabeçalho incorreto na posição ${i + 1}. Esperado: "${expectedHeadersArray[i]}", Encontrado: "${headersArray[i]}"`);
            return false;
        }
    }

    return true;
}

/**
 * Lê um arquivo Excel e retorna um array de objetos
 * @param {string} fileName - Nome do arquivo Excel
 * @param {string} sheetName - Nome da planilha (opcional)
 * @returns {Promise<Array<Object>>} - Array de objetos com os dados da planilha
 */
export async function readExcelFile(fileName = nome_da_planilha, sheetName = nome_da_sheet) {
    try {
        const filePath = path.join(pasta_planilhas, fileName);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
            throw new Error(`Planilha '${sheetName}' não encontrada`);
        }

        // Pega os cabeçalhos da primeira linha
        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] = cell.value;
        });

        // Verifica se os cabeçalhos estão corretos
        if (!verificarCabecalhos(headers, cabecalhos_da_planilha)) {
            throw new Error('Cabeçalhos da planilha não correspondem aos esperados');
        }

        // Converte as linhas em objetos
        const data = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Pula a linha de cabeçalho

            const rowData = {};
            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber - 1];
                if (header) {
                    rowData[header] = cell.value;
                }
            });
            data.push(rowData);
        });

        return data;
    } catch (error) {
        console.error('Erro ao ler o arquivo Excel:', error);
        throw error;
    }
}
