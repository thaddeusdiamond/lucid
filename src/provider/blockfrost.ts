import { C, Core } from "../core/mod.ts";
import { fromHex, toHex } from "../utils/mod.ts";
import {
  Address,
  Assets,
  Datum,
  DatumHash,
  ProtocolParameters,
  Provider,
  ScriptType,
  Slot,
  TxHash,
  Unit,
  UTxO,
} from "../types/mod.ts";

export class Blockfrost implements Provider {
  data: { url: string; projectId: string };

  constructor(url: string, projectId: string) {
    this.data = { url, projectId };
  }

  async getProtocolParameters(): Promise<ProtocolParameters> {
    const result = await fetch(`${this.data.url}/epochs/latest/parameters`, {
      headers: { project_id: this.data.projectId },
    }).then((res) => res.json());

    return {
      minFeeA: parseInt(result.min_fee_a),
      minFeeB: parseInt(result.min_fee_b),
      maxTxSize: parseInt(result.max_tx_size),
      maxValSize: parseInt(result.max_val_size),
      keyDeposit: BigInt(result.key_deposit),
      poolDeposit: BigInt(result.pool_deposit),
      priceMem: parseFloat(result.price_mem),
      priceStep: parseFloat(result.price_step),
      coinsPerUtxoByte: BigInt(result.coins_per_utxo_size),
      collateralPercentage: parseInt(result.collateral_percent),
      maxCollateralInputs: parseInt(result.max_collateral_inputs),
    };
  }
  async getCurrentSlot(): Promise<Slot> {
    return await fetch(`${this.data.url}/blocks/latest`, {
      headers: { project_id: this.data.projectId },
    })
      .then((res) => res.json())
      .then((res) => parseInt(res.slot));
  }

  async getUtxos(address: string): Promise<UTxO[]> {
    let result: BlockfrostUtxoResult = [];
    let page = 1;
    while (true) {
      let pageResult: BlockfrostUtxoResult | BlockfrostUtxoError = await fetch(
        `${this.data.url}/addresses/${address}/utxos?page=${page}`,
        { headers: { project_id: this.data.projectId } },
      ).then((res) => res.json());
      if ((pageResult as BlockfrostUtxoError).error) {
        if ((pageResult as BlockfrostUtxoError).status_code === 400) return [];
        else if ((pageResult as BlockfrostUtxoError).status_code === 500) {
          throw new Error("Could not fetch UTxOs from Blockfrost. Try again.");
        } else {
          pageResult = [];
        }
      }
      result = result.concat(pageResult as BlockfrostUtxoResult);
      if ((pageResult as BlockfrostUtxoResult).length <= 0) break;
      page++;
    }

    return (await Promise.all(
      result.map(async (r) => ({
        txHash: r.tx_hash,
        outputIndex: r.output_index,
        assets: (() => {
          const a: Assets = {};
          r.amount.forEach((am) => {
            a[am.unit] = BigInt(am.quantity);
          });
          return a;
        })(),
        address,
        datumHash: !r.inline_datum ? r.data_hash : null,
        datum: r.inline_datum,
        scriptRef: r.reference_script_hash &&
          (await (async () => {
            const {
              type,
            }: {
              type: ScriptType;
            } = await fetch(
              `${this.data.url}/scripts/${r.reference_script_hash}`,
              {
                headers: { project_id: this.data.projectId },
              },
            ).then((res) => res.json());
            // TODO: support native scripts
            if (type === "Native") {
              throw new Error("Native script ref not implemented!");
            }
            const { cbor } = await fetch(
              `${this.data.url}/scripts/${r.reference_script_hash}/cbor`,
              { headers: { project_id: this.data.projectId } },
            ).then((res) => res.json());
            const script = C.PlutusScript.from_bytes(fromHex(cbor));
            const scriptRef = C.ScriptRef.new(
              type === "PlutusV1"
                ? C.Script.new_plutus_v1(script)
                : C.Script.new_plutus_v2(script),
            );
            return toHex(scriptRef.to_bytes());
          })()),
      })),
    )) as UTxO[];
  }

  async getUtxosWithUnit(address: Address, unit: Unit): Promise<UTxO[]> {
    let result: BlockfrostUtxoResult = [];
    let page = 1;
    while (true) {
      let pageResult: BlockfrostUtxoResult | BlockfrostUtxoError = await fetch(
        `${this.data.url}/addresses/${address}/utxos/${unit}?page=${page}`,
        { headers: { project_id: this.data.projectId } },
      ).then((res) => res.json());
      if ((pageResult as BlockfrostUtxoError).error) {
        if ((pageResult as BlockfrostUtxoError).status_code === 400) return [];
        else if ((pageResult as BlockfrostUtxoError).status_code === 500) {
          throw new Error("Could not fetch UTxOs from Blockfrost. Try again.");
        } else {
          pageResult = [];
        }
      }
      result = result.concat(pageResult as BlockfrostUtxoResult);
      if ((pageResult as BlockfrostUtxoResult).length <= 0) break;
      page++;
    }
    return (await Promise.all(
      result.map(async (r) => ({
        txHash: r.tx_hash,
        outputIndex: r.output_index,
        assets: (() => {
          const a: Assets = {};
          r.amount.forEach((am) => {
            a[am.unit] = BigInt(am.quantity);
          });
          return a;
        })(),
        address,
        datumHash: !r.inline_datum ? r.data_hash : null,
        datum: r.inline_datum,
        scriptRef: r.reference_script_hash &&
          (await (async () => {
            const {
              type,
            }: {
              type: ScriptType;
            } = await fetch(
              `${this.data.url}/scripts/${r.reference_script_hash}`,
              {
                headers: { project_id: this.data.projectId },
              },
            ).then((res) => res.json());
            // TODO: support native scripts
            if (type === "Native") {
              throw new Error("Native script ref not implemented!");
            }
            const { cbor } = await fetch(
              `${this.data.url}/scripts/${r.reference_script_hash}/cbor`,
              { headers: { project_id: this.data.projectId } },
            ).then((res) => res.json());
            const script = C.PlutusScript.from_bytes(fromHex(cbor));
            const scriptRef = C.ScriptRef.new(
              type === "PlutusV1"
                ? C.Script.new_plutus_v1(script)
                : C.Script.new_plutus_v2(script),
            );
            return toHex(scriptRef.to_bytes());
          })()),
      })),
    )) as UTxO[];
  }

  async getDatum(datumHash: DatumHash): Promise<Datum> {
    const datum = await fetch(
      `${this.data.url}/scripts/datum/${datumHash}/cbor`,
      {
        headers: { project_id: this.data.projectId },
      },
    )
      .then((res) => res.json())
      .then((res) => res.cbor);
    if (!datum || datum.error) {
      throw new Error(`No datum found for datum hash: ${datumHash}`);
    }
    return datum;
  }

  async awaitTx(txHash: TxHash): Promise<boolean> {
    return await new Promise((res) => {
      const confirmation = setInterval(async () => {
        const isConfirmed = await fetch(`${this.data.url}/txs/${txHash}`, {
          headers: { project_id: this.data.projectId },
        }).then((res) => res.json());
        if (isConfirmed && !isConfirmed.error) {
          clearInterval(confirmation);
          res(true);
          return;
        }
      }, 3000);
    });
  }

  async submitTx(tx: Core.Transaction): Promise<TxHash> {
    const result = await fetch(`${this.data.url}/tx/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/cbor",
        project_id: this.data.projectId,
      },
      body: tx.to_bytes(),
    }).then((res) => res.json());
    if (!result || result.error) {
      if (result?.status_code === 400) throw new Error(result.message);
      else throw new Error("Could not submit transaction.");
    }
    return result;
  }
}

/** This function is temporarily needed only, until Blockfrost returns the datum natively in cbor
 *
 * The conversion is ambigious, that's why it's better to get the datum directly in cbor
 */

export const datumJsonToCbor = (json: DatumJson): Datum => {
  const convert = (json: DatumJson): Core.PlutusData => {
    if (!isNaN(json.int!)) {
      return C.PlutusData.new_integer(C.BigInt.from_str(json.int!.toString()));
    } else if (json.bytes || !isNaN(Number(json.bytes))) {
      return C.PlutusData.new_bytes(fromHex(json.bytes!));
    } else if (json.map) {
      const m = C.PlutusMap.new();
      json.map.forEach(({ k, v }: { k: unknown; v: unknown }) => {
        m.insert(convert(k as DatumJson), convert(v as DatumJson));
      });
      return C.PlutusData.new_map(m);
    } else if (json.list) {
      const l = C.PlutusList.new();
      json.list.forEach((v: DatumJson) => {
        l.add(convert(v));
      });
      return C.PlutusData.new_list(l);
    } else if (!isNaN(json.constructor! as unknown as number)) {
      const l = C.PlutusList.new();
      json.fields!.forEach((v: DatumJson) => {
        l.add(convert(v));
      });
      return C.PlutusData.new_constr_plutus_data(
        C.ConstrPlutusData.new(
          C.BigNum.from_str(json.constructor!.toString()),
          l,
        ),
      );
    }
    throw new Error("Unsupported type");
  };

  return toHex(convert(json).to_bytes());
};

type DatumJson = {
  int?: number;
  bytes?: string;
  list?: Array<DatumJson>;
  map?: Array<{ k: unknown; v: unknown }>;
  fields?: Array<DatumJson>;
  [constructor: string]: unknown; // number; constructor needs to be simulated like this as optional argument
};

type BlockfrostUtxoResult = Array<{
  tx_hash: string;
  output_index: number;
  amount: Array<{ unit: string; quantity: string }>;
  data_hash?: string;
  inline_datum?: string;
  reference_script_hash?: string;
}>;

type BlockfrostUtxoError = {
  status_code: number;
  error: unknown;
};
