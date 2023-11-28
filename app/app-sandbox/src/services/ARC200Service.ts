import * as backend from "../backend/arc200/index.ARC200.mjs";
import { zeroAddress } from "../utils/algorand.js";
import { fromSome } from "../utils/common.js";
import { makeStdLib } from "../utils/reach.js";

const stdlib = makeStdLib();
const fa = stdlib.formatAddress;
const bn = stdlib.bigNumberify;
const bn2n = stdlib.bigNumberToNumber;
const bn2bi = stdlib.bigNumberToBigInt;
const ib = stdlib.isBigNumber;

// deprecated
const ctcInfo = 249072786;

// deprecated
const getCTCInfo = () => ctcInfo;

const nextEvent = (eventName: string) => async (ctcInfo: number) => {
  const {
    e: { [eventName]: evt },
  } = (
    await stdlib.connectAccount({
      addr: zeroAddress,
    })
  ).contract(backend, ctcInfo);
  const t = await stdlib.getNetworkTime();
  await evt.seek(t);
  return await evt.next();
};

const nextTransferEvent = nextEvent("Transfer");

const getEvents =
  (eventName: string) => async (ctcInfo: number, time?: any) => {
    const {
      e: { [eventName]: evt },
    } = (
      await stdlib.connectAccount({
        addr: zeroAddress,
      })
    ).contract(backend, ctcInfo);
    const t = await stdlib.getNetworkTime();
    if (time) {
      await evt.seek(time);
    }
    const events: any = []; // TODO: type
    do {
      const event = await evt.nextUpToTime(t);
      if (!event) break;
      events.push(event);
    } while (events);
    return events;
  };

const getMintEvents = getEvents("Mint");
const getTransferEvents = getEvents("arc200_Transfer");
const getApproveEvents = getEvents("arc200_Approve");

const launch = async (addr: string, params: any) => {
  const acc = await stdlib.connectAccount({ addr });
  const ctc = acc.contract(backend);
  const ctcInfo = await stdlib.withDisconnect(() =>
    ctc.p.Deployer({
      params,
      ready: (ctcInfo: any) => {
        console.log("Ready!");
        stdlib.disconnect(ctcInfo); // causes withDisconnect to immediately return ctcInfo
      },
    })
  );
  return ctcInfo;
};
const getTokenMetadata = async (ctcInfo: number, addr: string) => {
  const storedTokenMetadata = localStorage.getItem(`token-${ctcInfo}`);
  if (!storedTokenMetadata) {
    const { v } = (
      await stdlib.connectAccount({
        addr: zeroAddress,
      })
    ).contract(backend, ctcInfo);
    const prepareString = (str: string) => {
      const index = str.indexOf("\x00");
      if (index > 0) {
        return str.slice(0, str.indexOf("\x00"));
      } else {
        return str;
      }
    };
    const {
      name: dName,
      symbol: dSymbol,
      decimals: decimalsBn,
      totalSupply: totalSupplyBn,
      zeroAddress: zeroAddressHexStr,
      manager: managerAddressHexStr,
    } = fromSome(await v.state(), {});
    const name = prepareString(dName);
    const symbol = prepareString(dSymbol);
    const decimals = bn2n(decimalsBn);
    const totalSupply = bn2bi(totalSupplyBn).toString();
    const tZeroAddress = fa(zeroAddressHexStr);
    const managerAddress = fa(managerAddressHexStr);
    const balanceBn = await balanceOf(ctcInfo, addr);
    const balance = bn2bi(balanceBn).toString();
    const metadata = {
      name: name,
      symbol,
      decimals,
      totalSupply,
      balanceOf: balance,  // Add balanceOf here
      zeroAddress: tZeroAddress,
      manager: managerAddress,
    };
    localStorage.setItem(`token-${ctcInfo}`, JSON.stringify(metadata));
     // console.log(`Balance of: ${balance}`);
    return metadata;
  } else {
    return JSON.parse(storedTokenMetadata);
  }
};

const allowance = async (ctcInfo: number, owner: any, spender: any) => {
  const acc = await stdlib.connectAccount({ addr: zeroAddress });
  const ctc = acc.contract(backend, ctcInfo);
  return fromSome(await ctc.v.arc200_allowance(owner, spender), bn(0));
};

const balanceOf = async (ctcInfo: number, addr: string) => {
  const acc = await stdlib.connectAccount({ addr: zeroAddress });
  const ctc = acc.contract(backend, ctcInfo);
  return fromSome(await ctc.v.arc200_balanceOf(addr), bn(0));
};


const totalSupply = async (ctcInfo: number) => {
  const acc = await stdlib.connectAccount({ addr: zeroAddress });
  const ctc = acc.contract(backend, ctcInfo);
  return fromSome(await ctc.v.arc200_totalSupply(), bn(0));
};

const decimals = async (ctcInfo: number) => {
  const acc = await stdlib.connectAccount({ addr: zeroAddress });
  const ctc = acc.contract(backend, ctcInfo);
  return fromSome(await ctc.v.arc200_decimals(), bn(0));
};

// code below from ChildService.ts

const state = async (token: any) => {
  const acc = await stdlib.getDefaultAccount();
  const ctc = acc.contract(backend, token.appId);
  const {
    v: { state: view },
  } = ctc;
  return await view();
};

const approve = async (
  token: any,
  addrFrom: string,
  addrSpender: string,
  amount: any
) => {
  console.log({
    token,
    addrFrom,
    addrSpender,
    amount,
  });
  const acc = await stdlib.connectAccount({ addr: addrFrom });
  console.log({ acc });
  const ctc = acc.contract(backend, token.appId);
  if (ib(amount)) {
    return await ctc.a.arc200_approve(addrSpender, amount);
  } else {
    const acc = await stdlib.connectAccount({ addr: addrFrom });
    const [lhs, rhs, rst] = amount.split(".");
    if (rst) throw Error("Invalid amount");
    const lhsBn = bn(parseInt(lhs)).mul(bn(10).pow(bn(token.decimals)));
    const rhsBn =
      token.decimals > 0
        ? bn((rhs ?? "0").slice(0, token.decimals).padEnd(token.decimals, "0"))
        : bn(0);
    const amountBn = token.decimals > 0 ? lhsBn.add(rhsBn) : lhsBn;
    return await ctc.a.arc200_approve(addrSpender, amountBn);
  }
};

const deposit = async (
  token: any,
  addrFrom: string,
  addrTo: string,
  amount: string
) => {
  const acc = await stdlib.connectAccount({ addr: addrFrom });
  const [lhs, rhs, rst] = amount.split(".");
  if (rst) throw Error("Invalid amount");
  const lhsBn = bn(parseInt(lhs)).mul(bn(10).pow(bn(token.decimals)));
  const rhsBn =
    token.decimals > 0
      ? bn((rhs ?? "0").slice(0, token.decimals).padEnd(token.decimals, "0"))
      : bn(0);
  const amountBn = token.decimals > 0 ? lhsBn.add(rhsBn) : lhsBn;
  const ctc = acc.contract(backend, token.appId);
  const {
    a: {
      U2: { deposit },
    },
  } = ctc;
  return deposit(addrTo, amountBn);
};

const transfer = async (
  token: any,
  addrFrom: string,
  addrTo: string,
  amount: string
) => {
  try {
    const acc = await stdlib.connectAccount({ addr: addrFrom });
    const [mlhs, mrhs, rst] = amount.split(".");
    if (rst) throw Error("Invalid amount: malformed number");
    const lhs = mlhs === "" ? "0" : mlhs;
    if (typeof mrhs === "string" && mrhs.length > token.decimals) {
      throw Error("Invalid amount: too many decimals");
    }
    const rhs = mrhs === "" || !mrhs ? "0" : mrhs;
    const lhsBase = parseInt(lhs);
    const lhsDecimals = token.decimals;
    const lhsBn = bn(parseInt(lhs)).mul(
      bn(10).pow(bn(parseInt(token.decimals)))
    );
    const rhsBn =
      parseInt(token.decimals) > 0
        ? bn(
            (rhs ?? "0")
              .slice(0, parseInt(token.decimals))
              .padEnd(parseInt(token.decimals), "0")
          )
        : bn(0);
    const amountBn = token.decimals > 0 ? lhsBn.add(rhsBn) : lhsBn;
    const ctc = acc.contract(backend, token.appId);
    const {
      a: { arc200_transfer: transfer },
    } = ctc;
    return transfer(addrTo, amountBn);
  } catch (e) {
    console.log({ e });
  }
};

const transferFrom = async (
  token: any,
  addrSpender: string,
  addrFrom: string,
  addrTo: string,
  amount: string
) => {
  try {
    const acc = await stdlib.connectAccount({ addr: addrSpender });
    const [mlhs, mrhs, rst] = amount.split(".");
    if (rst) throw Error("Invalid amount: malformed number");
    const lhs = mlhs === "" ? "0" : mlhs;
    if (typeof mrhs === "string" && mrhs.length > token.decimals) {
      throw Error("Invalid amount: too many decimals");
    }
    const rhs = mrhs === "" || !mrhs ? "0" : mrhs;
    const lhsBase = parseInt(lhs);
    const lhsDecimals = token.decimals;
    const lhsBn = bn(parseInt(lhs)).mul(
      bn(10).pow(bn(parseInt(token.decimals)))
    );
    const rhsBn =
      parseInt(token.decimals) > 0
        ? bn(
            (rhs ?? "0")
              .slice(0, parseInt(token.decimals))
              .padEnd(parseInt(token.decimals), "0")
          )
        : bn(0);
    const amountBn = token.decimals > 0 ? lhsBn.add(rhsBn) : lhsBn;
    const ctc = acc.contract(backend, token.appId);
    const {
      a: { arc200_transferFrom: transferFrom },
    } = ctc;
    return transferFrom(addrFrom, addrTo, amountBn);
  } catch (e) {
    console.log({ e });
  }
};

const withdraw = async (
  token: any,
  addrFrom: string,
  addrTo: string,
  amount: string
) => {
  const acc = await stdlib.connectAccount({ addr: addrFrom });
  const [lhs, rhs, rst] = amount.split(".");
  if (rst) throw Error("Invalid amount");
  const lhsBn = bn(parseInt(lhs)).mul(bn(10).pow(bn(token.decimals)));
  const rhsBn =
    token.decimals > 0
      ? bn((rhs ?? "0").slice(0, token.decimals).padEnd(token.decimals, "0"))
      : bn(0);
  const amountBn = lhsBn.add(rhsBn);
  const ctc = acc.contract(backend, token.appId);
  const {
    a: {
      U2: { withdraw },
    },
  } = ctc;
  return withdraw(addrTo, amountBn);
};

export default {
  launch,
  approve,
  deposit,
  transfer,
  transferFrom,
  withdraw,
  balanceOf,
  state,
  getMintEvents,
  getTransferEvents,
  getApproveEvents,
  getTokenMetadata,
  getCTCInfo,
  nextTransferEvent,
  totalSupply,
  decimals,
  allowance,
};
