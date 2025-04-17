import { chromium } from 'playwright';
import { GetProductById } from './amazon.mjs'
import { format_description } from './chat_gpt.mjs'
import { readExcelFile } from './exel.mjs'
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import readline from 'readline'
import fs from 'fs'

function criarPastaImgSeNaoExistir() {
    const pastaImg = path.join(__dirname, 'img');
  
    if (!fs.existsSync(pastaImg)) {
      fs.mkdirSync(pastaImg);
      console.log('Pasta "img" criada com sucesso!');
    } else {
      console.log('A pasta "img" já existe.');
    }
}
  
criarPastaImgSeNaoExistir();

function limparPasta(diretorio) {
    if (!fs.existsSync(diretorio)) {
        console.error("❌ Diretório não encontrado:", diretorio);
        return;
    }

    const arquivos = fs.readdirSync(diretorio);
    
    arquivos.forEach(arquivo => {
        const caminhoCompleto = path.join(diretorio, arquivo);
        const stats = fs.statSync(caminhoCompleto);

        if (stats.isFile()) {
            fs.unlinkSync(caminhoCompleto); // Remove o arquivo
            console.log(`🧹 Arquivo removido: ${arquivo}`);
        }
    });

    console.log('✅ Todos os arquivos da pasta foram removidos.');
}

limparPasta('./img')

dotenv.config();

let email = process.env.EMAIL
let pass = process.env.PASS
let intervalo = parseInt(process.env.INTERVALO)

/**
 * Função que executa a macro de cadastro de produtos na Amazon
 * @param {Array<Object>} paramsArray - Array de parâmetros para cada produto
 * @param {string} paramsArray[].nomeProduto - Nome do produto a ser cadastrado
 * @param {string} paramsArray[].caminhoImagem - Caminho completo da imagem do produto
 * @param {number} paramsArray[].quantidade - Quantidade do produto
 * @param {number} paramsArray[].preco - Preço do produto
 * @param {string} paramsArray[].ai_descricao - Descrição para geração de conteúdo via IA
 * @param {string} [paramsArray[].marca] - Marca do produto (opcional)
 * @param {string} [paramsArray[].gtin] - Código GTIN do produto
 * @param {number} [paramsArray[].length] - Comprimento do produto
 * @param {number} [paramsArray[].width] - Largura do produto 
 * @param {number} [paramsArray[].height] - Altura do produto
 * @param {number} [paramsArray[].weight] - Peso do produto
 * 
 * 
 */

async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        return response;
      } catch (err) {
        if (i < retries - 1) {
          console.warn(`Tentativa ${i + 1} falhou. Tentando novamente em ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          console.error("Todas as tentativas falharam.");
          throw err;
        }
      }
    }
}
  
async function macro(paramsArray, email, pass) {
    const browser = await chromium.launch({ headless: false });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // Define o timeout padrão (em milissegundos)
    context.setDefaultTimeout(24 * 60 * 60 * 1000); // 24 horas

    try {
            // Navega para a página inicial
        await page.goto('https://sellercentral.amazon.com.br/abis/listing/create/product_identity#product_identity');

        // Aguarda o campo de e-mail estar disponível
        await page.waitForSelector('#ap_email');

        // Preenche o email
        await page.evaluate((email) => {
            const input_email = document.querySelector('#ap_email');
            input_email.value = email;

            const button_continue = document.querySelector('#continue input');
            button_continue.click();
        }, email);

        // Aguarda o campo de senha aparecer
        await page.waitForSelector('#ap_password');

        // Preenche a senha
        await page.evaluate((pass) => {
            const input_pass = document.querySelector('#ap_password');
            input_pass.value = pass;
        }, pass);

        // Aguarda o botão "Fazer login" estar disponível e clica (opcional, caso não clique automático)
        const loginButton = await page.$('#signInSubmit');
        if (loginButton) await loginButton.click();

        // Espera até a URL mudar para incluir '/account-switcher'
        await page.waitForFunction(
            () => window.location.href.includes('/account-switcher')
        );

        console.log('Login detectado.');
        console.log('Selecione a região.');

        // Espera até a URL mudar para incluir '/account-switcher'
        await page.waitForFunction(
            () => window.location.href.includes('/abis/listing/create/product_identity')
        );

        // Aguarda mais 5 segundos (se necessário)
        await page.waitForTimeout(intervalo);

        // Processa cada conjunto de parâmetros
        for (const params of paramsArray) {
            try {

                // Verifica se o produto já está cadastrado na Amazon
                if (params.gtin) {
                    let check = await GetProductById(params.gtin);
                    if(check.numberOfResults > 0){
                        console.log(`Produto com GTIN ${params.gtin} já cadastrado na Amazon. Pulando...`);
                        continue;
                    }
                }

                // Navega para a página inicial de cadastro
                await page.goto('https://sellercentral.amazon.com.br/abis/listing/create/product_identity#product_identity');

                // Muda somente para campos obrigatorios
                await page.evaluate(() => {
                    document.querySelector('[name="attribute_filter_radio_buttons-required"]')._input.dispatchEvent(new Event('change', { bubbles: true })); 
                });

                
                // Aguarda o campo de nome do produto estar disponível
                await page.waitForSelector('#item_name\\#1\\.value');



                let produto = JSON.stringify(params);
                // Gera a descrição e o nome do produto com a IA
                let resultado_chatgpt = await format_description(produto);
                resultado_chatgpt = JSON.parse(resultado_chatgpt);
                params.ai_descricao = resultado_chatgpt.descrição;
                params.nomeProduto = resultado_chatgpt.nome;

                // Preenche o nome do produto
                await page.evaluate((nomeProduto) => {
                    const textarea = document.querySelector("#item_name\\#1\\.value").shadowRoot.querySelector('textarea');
                    textarea.value = nomeProduto;
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }, params.nomeProduto);

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo * 3);

                // Verifica se existe o elemento de tipo de produto
                const hasProductType = await page.evaluate(() => {
                    let product_type = document.querySelector('[label="Selecionar Tipo de produto"]');
                    if (product_type) {
                        return true;
                    }
                    return false;
                });

                // Se encontrou o elemento, para a execução
                if (hasProductType == true) {
                    console.log("Não foi encontrado um tipo de produto");
                    continue;
                }

                // Aguarda 10 segundos
                await page.waitForTimeout(intervalo);

                // Clica no botão de aceitar recomendação
                await page.evaluate(() => {
                    const button = document.querySelector('[data-cy="pt-recommendations-confirm-button"]');
                    button.dispatchEvent(new Event('click', { bubbles: true }));
                });

                // Aguarda 10 segundos
                await page.waitForTimeout(intervalo);

                // Verifica e atribui o browse node se estiver vazio
                await page.evaluate(() => {
                    const browse_nodes = document.querySelector('#recommended_browse_nodes\\#1\\.value');
                    if (browse_nodes.value === undefined) {
                        browse_nodes.value = browse_nodes.__options[0].value;
                        browse_nodes.dispatchEvent(new Event('change', { bubbles: true })); 
                    }
                });

                 // Aguarda 5 segundos
                 await page.waitForTimeout(intervalo);

                // Verifica se marca foi informada
                if (params.marca) {
                    await page.evaluate((marca) => {
                        // Preenche a marca
                        const brand = document.querySelector('[name="brand-0-value"]');
                        brand._input.value = marca;
                        brand.dispatchEvent(new Event('blur', { bubbles: true }));
                    }, params.marca);
                }else{
                    // Seleciona a checkbox de não ter marca
                    await page.evaluate(() => {
                        const checkbox1 = document.querySelector('[data-testid="no-brand-name-checkbox"]').shadowRoot.querySelector('[part="checkbox-check"]');
                        checkbox1.dispatchEvent(new Event('click', { bubbles: true }));
                    });
                }

                 // Aguarda 5 segundos
                 await page.waitForTimeout(intervalo);

                // Verifica se gtin foi informado
                if (params.gtin) {
                    await page.evaluate((gtin) => {
                        // Preenche o GTIN
                        const gtinInput = document.querySelector('[name="externally_assigned_product_identifier-0-value"]');
                        gtinInput._input.value = gtin;
                        gtinInput.dispatchEvent(new Event('blur', { bubbles: true }));

                        // Define o tipo do GTIN
                        const gtinType = document.querySelector('[name="externally_assigned_product_identifier-0-type"]');
                        gtinType.value = "upc/ean/gtin";
                        gtinType.dispatchEvent(new Event('change', { bubbles: true }));
                    }, params.gtin);
                }else{
                    // Seleciona a checkbox de não ter GTIN
                    await page.evaluate(() => {
                        const checkbox2 = document.querySelector('[data-cy="upc-exemption-checkbox"]').shadowRoot.querySelector('[part="checkbox-check"]');
                        checkbox2.dispatchEvent(new Event('click', { bubbles: true }));
                    });
                }
                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                 // Clica no botão próximo
                 await page.evaluate(() => {
                    const button = document.querySelector('#next-button');
                    button.dispatchEvent(new Event('click', { bubbles: true }));
                });

                 // Aguarda 5 segundos
                 await page.waitForTimeout(intervalo);


                // Verifica se existe alerta de restrição da marca
                const hasRestriction = await page.evaluate(() => {
                    const restriction_alert = document.querySelector('[data-cy="seller-qualification-restriction-alert"]');
                    return restriction_alert !== null;
                });

                if (hasRestriction) {
                    console.log("Necessario pré aprovação da marca para criação do anuncio.");
                    continue;
                }

                 // Aguarda 5 segundos
                 await page.waitForTimeout(intervalo);


                // Verifica se foi encontrado um produto semelhante
                const findProduct = await page.evaluate(() => {
                    const modal = document.querySelector('[value="SELECTED_NOT_MY_PRODUCT"]')
                    return modal !== null;
                });

                if (findProduct) {
                    console.log("Opa parece que foi encontrado produtos equivalentes, vamos continuar.");
                    //Seleciona a opção "Não é o meu produto."
                    document.querySelector('[value="SELECTED_NOT_MY_PRODUCT"]')._input.dispatchEvent(new Event('change', { bubbles: true }));

                    //Fecha o modal clicando em "Retornar ao formulario."
                    document.querySelector('[label="Retornar ao formulário"]').dispatchEvent(new Event('click', { bubbles: true }));
                }


                // Verifica se o modal de aprovação automática está visível
                await page.evaluate(() => {
                    const modal = document.querySelector('[data-cy="seller-qualification-auto-approval-modal"]');
                    if (modal && modal.__visible === true) {
                        const button2 = document.querySelector('[data-cy="seller-qualification-auto-approval-modal-button"]');
                        button2.dispatchEvent(new Event('click', { bubbles: true }));
                    }
                });

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Clica no botão "Experimente agora"
                await page.evaluate(() => {
                    const button = document.querySelector('[data-testid="expandButton"]');
                    button.dispatchEvent(new Event('click', { bubbles: true }));
                });

                // Aguarda 2 segundos
                await page.waitForTimeout(intervalo);

                // Preenche o campo de gerar conteúdo
                await page.evaluate((ai_descricao) => {
                    const textarea = document.querySelector('[data-testid="queryInput"]');
                    const shadowRoot = textarea.shadowRoot.querySelector('textarea');
                    shadowRoot.value = ai_descricao;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }, params.ai_descricao);

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo * 5);

                // Clica no botão gerar conteúdo
                await page.evaluate(() => {
                    const button = document.querySelector('[data-testid="generateButton"]');
                    button.dispatchEvent(new Event('click', { bubbles: true }));
                });

                // Aguarda 10 segundos
                await page.waitForTimeout(intervalo);

                //------------------------------Parte da Imagem Principal------------------------------------//

                //Encontra o elemento input da imagem
                const fileInput = page.locator('input[id="ProductImage_MAIN-input_input"]');

                if(!fileInput){
                    console.log('Elemento da imgem não encontrada.')
                }

                //Baixa a img original, salva local e converte para png
                const response = await fetchWithRetry(params.caminhoImagem);


                const buffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(buffer);
                const tempImagePath = path.join('img', `temp_${Date.now()}.png`);
                await sharp(imageBuffer).png().toFile(tempImagePath);

                // Seta a imagem diretamente no input
                await fileInput.setInputFiles(tempImagePath);

                console.log('Imagem setada corretamente.')

                //---------------------------------Fim da Parte da Imagem-----------------------------------------//

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Clica no menu "Detalhes do produto"
                await page.evaluate(() => {
                    const menuItem = document.querySelector('#product_details-link');
                    menuItem.dispatchEvent(new Event('click', { bubbles: true }));
                });

                // Aguarda 2 segundos para carregar os campos
                await page.waitForTimeout(intervalo);

                // Chama a função para preencher os detalhes do produto
                await preencherDetalhesProduto(page);

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Clica no menu "Oferta"
                await page.evaluate(() => {
                    const menuItem = document.querySelector('#offer-link');
                    menuItem.dispatchEvent(new Event('click', { bubbles: true }));
                });

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define a quantidade
                await page.evaluate((quantidade) => {
                    const input = document.querySelector('#fulfillment_availability\\#1\\.quantity').shadowRoot.querySelector('input');
                    input.value = quantidade;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, params.quantidade);

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define o preço
                await page.evaluate((preco) => {
                    const input = document.querySelector('#purchasable_offer-0-our_price-0-schedule-0-value_with_tax')
                    input.shadowRoot.querySelector('input').value = preco;
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }, params.preco);

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define a condição do produto
                await page.evaluate(() => {
                    const input1 = document.querySelector('[name="condition_type-0-value"]');
                    input1.value = "new_new";
                    input1.dispatchEvent(new Event('change', { bubbles: true }));
                });
 
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);


                // Verifica se foi encontrado um produto semelhante
                const findListPrice = await page.evaluate(() => {
                    const input = document.querySelector('#list_price-0-value_with_tax')
                    return input !== null;
                });

                if(findListPrice){
                // Define o preço de lista
                await page.evaluate((preco) => {
                    const input2 = document.querySelector('#list_price-0-value_with_tax')._input;
                    input2.value = preco;
                    input2.dispatchEvent(new Event('change', { bubbles: true }));
                }, params.preco);
                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);
                }

                // Define o método de envio
                await page.evaluate(() => {
                    const input3 = document.querySelector('#offerFulfillment-MFN')._input;
                    input3.value = "MFN";
                    input3.dispatchEvent(new Event('change', { bubbles: true }));
                });
  
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define as unidades de medida das dimensões e peso
                await page.evaluate(() => {
                    const lengthUnit = document.querySelector('[name="item_package_dimensions-0-length-unit"]');
                    lengthUnit.value = "centimeters";
                    lengthUnit.dispatchEvent(new Event('change', { bubbles: true }));

                    const widthUnit = document.querySelector('[name="item_package_dimensions-0-width-unit"]');
                    widthUnit.value = "centimeters"; 
                    widthUnit.dispatchEvent(new Event('change', { bubbles: true }));

                    const heightUnit = document.querySelector('[name="item_package_dimensions-0-height-unit"]');
                    heightUnit.value = "centimeters";
                    heightUnit.dispatchEvent(new Event('change', { bubbles: true }));

                    const weightUnit = document.querySelector('[name="item_package_weight-0-unit"]');
                    weightUnit.value = "kilograms";
                    weightUnit.dispatchEvent(new Event('change', { bubbles: true }));
                });
    
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define os valores das dimensões e peso
                await page.evaluate((params) => {
                    const length = document.querySelector('[name="item_package_dimensions-0-length-value"]')._input;
                    length.value = params.length;
                    length.dispatchEvent(new Event('change', { bubbles: true }));

                    const width = document.querySelector('[name="item_package_dimensions-0-width-value"]')._input;
                    width.value = params.width;
                    width.dispatchEvent(new Event('change', { bubbles: true }));

                    const height = document.querySelector('[name="item_package_dimensions-0-height-value"]')._input;
                    height.value = params.height;
                    height.dispatchEvent(new Event('change', { bubbles: true }));

                    const weight = document.querySelector('[name="item_package_weight-0-value"]')._input;
                    weight.value = params.weight;
                    weight.dispatchEvent(new Event('change', { bubbles: true }));
                }, params);

                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Clica no menu "Segurança e Conformidade"
                await page.evaluate(() => {
                    const link = document.querySelector('#safety_and_compliance-link');
                    link.dispatchEvent(new Event('click', { bubbles: true }));
                });
                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define o país de origem
                await page.evaluate(() => {
                    const input1 = document.querySelector('[name="country_of_origin-0-value"]');
                    input1.value = "BR";
                    input1.dispatchEvent(new Event('change', { bubbles: true }));
                });
    
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define a descrição da garantia
                await page.evaluate(() => {
                    const input2 = document.querySelector('[name="warranty_description-0-value"]');
                    input2._input.value = "1 Mês de Garantia";
                    input2.dispatchEvent(new Event('blur', { bubbles: true }));
                });
      
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Verifica se o campo 'Precisa de bateria existe'
                const needBattery = await page.evaluate(() => {
                    const modal = document.querySelector('[name="batteries_required-0-value"][value=false]')
                    return modal !== null;
                });


                if(needBattery){
                // Define se requer baterias
                await page.evaluate(() => {
                    const input3 = document.querySelector('[name="batteries_required-0-value"][value=false]')._input;
                    input3.checked = true;
                    input3.dispatchEvent(new Event('change', { bubbles: true }));
                });
         
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo)
               }

                // Define regulamentação de produtos perigosos
                await page.evaluate(() => {
                    const input4 = document.querySelector('[name="supplier_declared_dg_hz_regulation-0-value"]');
                    input4.value = "not_applicable";
                    input4.dispatchEvent(new Event('change', { bubbles: true }));
                });

                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define certificado de conformidade
                await page.evaluate(() => {
                    const input5 = document.querySelector('[name="required_product_compliance_certificate-0-value"]');
                    input5.value = "Not Applicable";
                    input5.dispatchEvent(new Event('change', { bubbles: true }));
                });
  
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);

                // Define certificação de teste externo
                await page.evaluate(() => {
                    const input6 = document.querySelector('[name="external_testing_certification-0-value"]')
                    input6._textarea.value = "Não aplicável";
                    input6.dispatchEvent(new Event('blur', { bubbles: true }));
                });

                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);
                
                // Clica no botão de submissão
                await page.evaluate(() => {
                    const submit_button = document.querySelector('#submit-button');
                    submit_button.dispatchEvent(new Event('click', { bubbles: true }));
                });

                console.log(`Produto "${params.nomeProduto}" cadastrado com sucesso!`);

                
                // Aguarda 5 segundos
                await page.waitForTimeout(intervalo);
            } catch (error) {
                console.error(`Erro ao cadastrar o produto "${params.nomeProduto}":`, error);
                // Continua para o próximo produto mesmo se houver erro
                continue;
            }
        }

        console.log('Processo concluído com sucesso!');

    } catch (error) {
        console.error('Ocorreu um erro durante a execução:', error);
    } finally {
        // Mantém o navegador aberto para visualização
        // await browser.close();
    }
}

/**
 * Função que preenche os detalhes do produto na página da Amazon
 * @param {Page} page - Objeto da página do Playwright
 */

async function esperarUsuarioDigitarContinue() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question("Tem campos dos \"detalhes do produto\" que precisará preencher. Assim que preencher, digite 'Continue' para prosseguirmos: ", answer => {
            rl.close();
            if (answer.trim().toLowerCase() === 'continue') {
                resolve();
            } else {
                console.log("❌ Digite exatamente 'Continue' para continuar.");
                resolve(esperarUsuarioDigitarContinue());
            }
        });
    });
}

async function verificarCampos(page) {
    return await page.evaluate(() => {
        let menu_product_details_div = document.querySelector('#menu-product_details');
        let all_attributes_input = menu_product_details_div.querySelectorAll('[placeholder]');
        let camposNaoPreenchidos = [];

        all_attributes_input.forEach((input) => {
            const tagName = input.tagName.toLowerCase();
            const name = input.getAttribute('name');
            let estaPreenchido = false;

            if (tagName.includes('kat-input') || tagName.includes('kat-predictive_input')) {
                const inputElement = input._input;
                if (inputElement) {
                    estaPreenchido = inputElement.value !== "";
                    if (!estaPreenchido) {
                        camposNaoPreenchidos.push({ tipo: 'input', name });
                    }
                }
            } else if (tagName.includes('kat-textarea') || tagName.includes('kat-predictive_textarea')) {
                const textareaElement = input._textarea;
                if (textareaElement) {
                    estaPreenchido = textareaElement.value !== "";
                    if (!estaPreenchido) {
                        camposNaoPreenchidos.push({ tipo: 'textarea', name });
                    }
                }
            } else if (tagName.includes('kat-dropdown')) {
                estaPreenchido = input.value !== undefined;
                const options = input.__options || input.options || [];
                if (options.length > 0) {
                    const opcaoCentimetros = options.find(opt =>
                        opt.name.toLowerCase() === 'centímetros' || opt.name.toLowerCase() === 'centimetros'
                    );
                    if (opcaoCentimetros && !estaPreenchido) {
                        input.value = opcaoCentimetros.value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        estaPreenchido = true;
                    }
                }
                if (!estaPreenchido) {
                    camposNaoPreenchidos.push({ tipo: 'dropdown', name });
                }
            }
        });

        return camposNaoPreenchidos;
    });
}

async function preencherDetalhesProduto(page) {
    let camposNaoPreenchidos = await verificarCampos(page);

    if (camposNaoPreenchidos.length > 0) {
        console.log('\n📋 Resumo de Campos Não Preenchidos:');
        camposNaoPreenchidos.forEach((campo, index) => {
            console.log(`${index + 1}. ${campo.name} (${campo.tipo})`);
        });

        await esperarUsuarioDigitarContinue();

        // Verifica novamente após o usuário confirmar preenchimento
        camposNaoPreenchidos = await verificarCampos(page);

        if (camposNaoPreenchidos.length > 0) {
            console.log("\n❌ Ainda existem campos não preenchidos:");
            camposNaoPreenchidos.forEach((campo, index) => {
                console.log(`${index + 1}. ${campo.name} (${campo.tipo})`);
            });
           await preencherDetalhesProduto(page)
        } else {
            console.log("\n✅ Agora sim, todos os campos estão preenchidos!");
        }
    } else {
        console.log('\n✅ Todos os campos estão preenchidos!');
    }
}

async function main(){
    let planilha = await readExcelFile();
 
    // Se houver produtos para cadastrar
    if(planilha.length > 0){
        console.log("Iniciando o cadastro dos produtos...");

        // Converte o produto para o formato correto
        planilha = planilha.map(produto => {


            const substituirDecimal = valor => {
                if (typeof valor === 'number') {
                    valor = valor.toString();
                }
            
                if (typeof valor === 'string') {
                    return valor.replace('.', ',').replace(';', '.');
                }
            
                return valor;
            };
            
                return {
                    nomeProduto: produto.Descrição,
                    caminhoImagem: produto["Imagem(Link)"],
                    quantidade: produto.Quantidade,
                    preco: substituirDecimal(produto.Preço),
                    marca: produto.Marca,
                    gtin: produto.Gtin,
                    length: substituirDecimal(produto.Comprimento),
                    width: substituirDecimal(produto.Largura),
                    height: substituirDecimal(produto.Altura),
                    weight: substituirDecimal(produto.Peso)
                }
            
        });

        // Executa a macro de cadastro de produtos
        macro(planilha, email, pass);

    }else{
        console.log("Sem produtos para cadastrar");
    }
}

main();