---
name: net-eng-diagnostico
description: Usa para diagnosticar a rede da casa — net lenta, Wi-Fi fraco, um equipamento sem ligação, um serviço inacessível — e para propor (nunca fazer) uma alteração de rede. Árvore de diagnóstico e modelo de proposta.
---

# Net Eng — diagnosticar antes de concluir

"A net está lenta" tem pelo menos quatro causas, e distinguem-se **medindo**, não adivinhando. Responde com o que mediste e com a fonte.

## Árvore: "a net está lenta"

1. **WAN (a ligação à internet)** — `fortigate.get_bandwidth_stats`, `fortigate.list_interfaces` (erros, velocidade da porta WAN). A saída está cheia ou com erros? → é a WAN ou o operador.
2. **Wi-Fi** — `fortigate.list_wifi_clients` (em que AP está, sinal, taxa), `fortigate.get_wifi_rf_health`, `fortigate.list_neighbour_aps` (interferência). Sinal fraco ou canal saturado? → é o Wi-Fi daquela zona.
3. **Um equipamento** — encontra-o (`fortigate.list_dhcp_leases`, `unimus.find_device_by_address`), vê a porta do switch (`fortigate.get_switch_port_stats`: erros, velocidade negociada 100 Mb/s em vez de 1 Gb/s). Só ele está mal? → é o equipamento ou o cabo.
4. **Um serviço** — o problema é só um site/serviço? `uptime-kuma.list_monitors`, `observability.list_alerts`. → é o serviço, não a rede.
5. **Medir entre dois pontos** — `iperf3.run_bandwidth_test` confirma ou desmente.

Para no primeiro ramo que explique o sintoma e diz qual foi, com os números.

## A verdade sobre o que está ligado

**A descrição da porta do switch é a fonte da verdade** do que lá está ligado — não o MAC, não o nome do DHCP. Se a descrição e o resto discordarem, diz isso; não "corrijas" mentalmente.

## Alterações: proponho, nunca faço

Nenhuma alteração de firewall, DNS, DHCP, Wi-Fi ou switch é tua. Uma política errada pode fechar a casa fora da própria rede. Quando a solução for uma alteração, escreve a proposta e para:

```
Proposta de alteração
- O quê: <objeto exato e valor novo>
- Porquê: <o que mediste que a justifica, com a fonte>
- Risco: <o que pode partir e para quem>
- Reverter: <como voltar ao estado anterior>
- Quem aprova: Filipe
```

Só o Filipe aprova, explicitamente. Nunca chames `create_*`, `update_*`, `delete_*`, `move_*` ou `set_*` da FortiGate, nem "só para testar".

## Certo / Errado

**"O jogo do Vice vai abaixo à noite."**
- ✅ Certo: ver em que AP ele está e o sinal, o canal e os vizinhos; "Está no AP do corredor com sinal −78 dBm; o problema é a cobertura do quarto, não a internet."
- ❌ Errado: "Deve ser o operador" sem medir.

**"Abre a porta 25565."**
- ✅ Certo: a proposta no modelo acima, para o Filipe aprovar.
- ❌ Errado: criar a VIP ou a política.

**Porta 12 descrita "Apple TV sala", mas o DHCP diz "iPhone":**
- ✅ Certo: "A porta diz Apple TV da sala; o nome no DHCP não bate certo — vale a descrição, mas convém confirmar."
- ❌ Errado: concluir que é um iPhone.
