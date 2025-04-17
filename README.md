# Macro Amazon Seller

Esta é uma macro para automatização de processos relacionados à Amazon Seller.

## Sobre o Projeto

Esta ferramenta tem como objetivo simplificar o processo de cadastro de novos produtos na Amazon. Em conjunto com a planilha fornecida, o script preencherá automaticamente a maioria das informações dos produtos, especialmente aquelas que são padronizadas.

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- [Visual Studio Code](https://code.visualstudio.com/)
- [Node.js](https://nodejs.org/)
- Chaves de API:
  - Amazon Selling Partner API
  - OpenAI (ChatGPT) API

## Configuração

1. Clone este repositório
2. Configure o arquivo `.env` com suas credenciais e configurações da planilha
3. Instale as dependências do projeto:

```bash
npm i
```

4. Instale o playwright com o comando:

```bash
npx playwright install
```


## Execução

Para iniciar a macro, execute no terminal:

```bash
node app.mjs
```

## Instruções de Uso da Planilha

### Preenchimento dos Dados

1. **Informações Básicas**:
   - Preencha as informações solicitadas na planilha de produtos
   - Não é necessário se preocupar com formatação dos nomes, o script fará esse tratamento

2. **Campos Importantes**:
   - **GTIN**: 
     - Deve conter 13 ou 14 caracteres
     - Verifique cuidadosamente este campo para evitar erros
     - Caso não informado, será marcado como "Não possui"

   - **Medidas e Peso**:
     - Informar medidas em CM
     - Informar peso em KG
     - Caso receba valores em outras unidades (gramas, etc), faça a conversão antes de inserir

   - **Imagens**:
     - Forneça um link válido para a imagem principal
     - Formatos aceitos: JPEG, PNG ou WebP (serão convertidos para PNG)

   - **Marca**:
     - Se não informada, o produto será marcado como genérico

### Funcionamento do Script

O script automaticamente:
1. Verifica se o produto já está cadastrado na Amazon
2. Valida restrições de marca
3. Identifica e preenche o tipo de produto
4. Completa informações padrão solicitadas pela Amazon

### Critérios de Exclusão

O script pulará produtos que:
- Já estejam cadastrados na Amazon
- Possuam marca com restrição junto à Amazon
- Não tenham um "Tipo de produto" identificável

## Configuração da Planilha

Para alterar as configurações da planilha que será utilizada, modifique as variáveis correspondentes no arquivo `.env`.

## Observações Importantes

- Certifique-se de que todas as chaves de API estejam corretamente configuradas no arquivo `.env`
- Mantenha suas chaves de API em segurança e não as compartilhe
- Verifique se todas as dependências foram instaladas corretamente antes de executar a macro
- Revise a descrição dos produtos para garantir coerência, mesmo que o script faça tratamentos automáticos 