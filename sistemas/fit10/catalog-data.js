/* Catalogo piloto Fit10. Bases derivadas dos nos do GLB perfil-duo.
   Modulos e acessorios: placeholders da familia Fit10 ate material novo do Vinicius. */
window.Fit10Catalog = {
  bases: [
    {
      id: "perfil-duo",
      label: "Perfil Duo",
      mediaLabel: "Perfil",
      rows: [
        { ref: "Perfil_Duo", descricao: "Perfil base da montagem Duo", etapa: "01", nota: "No GLB piloto" },
        { ref: "Curva_90", descricao: "Canto 90 graus", etapa: "02", nota: "Encaixa no perfil" },
        { ref: "Haste_Esquerda", descricao: "Haste esquerda", etapa: "03", nota: "Montagem final" },
        { ref: "Haste_Direita", descricao: "Haste direita", etapa: "03", nota: "Montagem final" }
      ],
      gerais: [
        "Montagem guiada pelo scroll (roteiro Vinicius 19/11).",
        "Usuario nao gira o modelo. So acompanha a sequencia."
      ]
    },
    {
      id: "acabamentos-piloto",
      label: "Acabamentos (piloto)",
      mediaLabel: "Cores",
      rows: [
        { ref: "BT", descricao: "Branco Total", etapa: "-", nota: "Paleta Newline" },
        { ref: "PT", descricao: "Preto (tom grafite no 3D)", etapa: "-", nota: "Evitar preto absoluto" },
        { ref: "GR", descricao: "Grafite", etapa: "-", nota: "Paleta Newline" },
        { ref: "AD", descricao: "Aluminio", etapa: "-", nota: "Paleta Newline" },
        { ref: "DO", descricao: "Dourado", etapa: "-", nota: "Paleta Newline" }
      ],
      gerais: [
        "Lista resumida para o piloto visual.",
        "Tabela completa de acabamentos aguarda ficha oficial do sistema."
      ]
    }
  ],
  modulos: [
    {
      id: "modulos-fit10",
      label: "Modulos Fit10",
      mediaLabel: "Modulo",
      rows: [
        { ref: "Difuso", descricao: "Modulo difuso", etapa: "pendente", nota: "GLB / tabela Vinicius" },
        { ref: "Grid 6 focos", descricao: "Grid 10 W", etapa: "pendente", nota: "Familia Fit10" },
        { ref: "Grid articulavel", descricao: "Grid articulavel 10 W", etapa: "pendente", nota: "Familia Fit10" },
        { ref: "Spot Fit10", descricao: "Spot 4 W ou 7 W", etapa: "pendente", nota: "Familia Fit10" }
      ],
      gerais: [
        "Compatibilidade citada na ficha Fit10 Wall.",
        "Animacao 3D e skus detalhados ainda nao vieram no pacote fit10-teste."
      ]
    }
  ],
  acessorios: [
    {
      id: "acessorios-fit10",
      label: "Acessorios Fit10",
      mediaLabel: "Acessorio",
      rows: [
        { ref: "Driver", descricao: "Driver dos modulos (vendido separado)", etapa: "pendente", nota: "Ficha Fit10 Wall" },
        { ref: "Canopla", descricao: "Canopla / fixacao (familia Pendente)", etapa: "pendente", nota: "Material Vinicius" },
        { ref: "Cabos / kits", descricao: "Kits de instalacao", etapa: "pendente", nota: "Material Vinicius" }
      ],
      gerais: [
        "Secao estrutural do piloto. Dados de catalogo e GLBs de acessorios pendentes."
      ]
    }
  ]
};
