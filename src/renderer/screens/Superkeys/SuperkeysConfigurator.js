// -*- mode: js-jsx -*-
/* Bazecor -- Kaleidoscope Command Center
 * Copyright (C) 2018, 2019  Keyboardio, Inc.
 * Copyright (C) 2019  DygmaLab SE
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import React from "react";
import { toast } from "react-toastify";
import Styled from "styled-components";

// Styling and elements
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { FiSave, FiTrash2 } from "react-icons/fi";

// Components
import SuperkeyManager from "../../components/SuperkeyManager";
import KeyConfig from "../../components/KeyManager/KeyConfig";

// API's
import i18n from "../../i18n";
import Keymap, { KeymapDB } from "../../../api/keymap";
import Focus from "../../../api/focus";
import Backup from "../../../api/backup";

const Store = require("electron-store");
const store = new Store();

const Styles = Styled.div`
height: -webkit-fill-available;
display: flex;
flex-direction: column;
  .toggle-button{
    text-align: center;
    padding-bottom: 8px;
  }
  .save-button {
    text-align: center;
  }
  .supercontainer {
    margin-right: auto;
    margin-left: auto;
    margin-top: 0.4rem;
    width: inherit;
  }
  .keyboardcontainer {
    margin-right: auto;
    margin-left: auto;
    width: 1440px;
    height: -webkit-fill-available;
    display: flex;
  }
  .save-row {
    position: absolute;
    right: 30px;
    top: 65px;
  }
  .button-large {
    font-size: 2rem;
    width: -webkit-fill-available;
    text-align: left;
  }
  .cancel-active{
    background-color: ${({ theme }) => theme.colors.button.cancel};
  }
  .save-active{
    background-color: ${({ theme }) => theme.colors.button.save};
  }
  .button-large:not(:disabled):not(.disabled):hover {
    color: ${({ theme }) => theme.colors.button.text};
    background-color: ${({ theme }) => theme.colors.button.active};
    border: none;
  }
`;

const ModalStyle = Styled.div`
  .modalcol {
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.button.deselected};
  }
  .modal-footer {
    justify-content: space-between;
  }
  .titles {
    margin-bottom: 0;
  }
  .alignvert {
    padding-top: 10px;
    float: left;
  }
  .selectButton {
    float: left;
    .dropdown-toggle{
      font-size: 0.97rem;
    }
  }
  .gridded {
    display: grid;
  }
`;

class SuperkeysConfigurator extends React.Component {
  constructor(props) {
    super(props);

    this.keymapDB = new KeymapDB();
    this.bkp = new Backup();

    this.state = {
      keymap: [],
      macros: [],
      storedMacros: [],
      superkeys: [],
      storedSuper: [],
      maxMacros: 64,
      modified: false,
      modifiedKeymap: false,
      selectedSuper: 0,
      selectedAction: -1,
      showDeleteModal: false,
      listToDelete: [],
      futureSK: [],
      futureSSK: 0,
      currentLanguageLayout: store.get("settings.language") || "english"
    };
    this.changeSelected = this.changeSelected.bind(this);
    this.updateSuper = this.updateSuper.bind(this);
    this.changeAction = this.changeAction.bind(this);
    this.updateAction = this.updateAction.bind(this);
    this.loadSuperkeys = this.loadSuperkeys.bind(this);
    this.onKeyChange = this.onKeyChange.bind(this);
    this.saveName = this.saveName.bind(this);
    this.writeSuper = this.writeSuper.bind(this);
    this.checkKBSuperkeys = this.checkKBSuperkeys.bind(this);
    this.toggleDeleteModal = this.toggleDeleteModal.bind(this);
    this.RemoveDeletedSK = this.RemoveDeletedSK.bind(this);
  }

  async componentDidMount() {
    await this.loadSuperkeys();
  }

  async loadSuperkeys() {
    let focus = new Focus();
    try {
      /**
       * Create property language to the object 'options', to call KeymapDB in Keymap and modify languagu layout
       */
      let chipID = (await focus.command("hardware.chip_id")).replace(/\s/g, "");
      let neurons = store.get("neurons");
      let neuron = {};
      if (neurons.some(n => n.id == chipID)) {
        console.log(neurons.filter(n => n.id == chipID));
        neuron = neurons.filter(n => n.id == chipID)[0];
      }
      this.setState({
        neurons,
        neuronID: neurons.findIndex(n => n.chipID == this.state.chipID),
        storedMacros: neuron.macros,
        storedSuper: neuron.superkeys
      });
      let deviceLang = { ...focus.device, language: true };
      focus.commands.keymap = new Keymap(deviceLang);
      this.keymapDB = focus.commands.keymap.db;
      let kbtype = "iso";
      try {
        kbtype = focus.device && focus.device.info.keyboardType === "ISO" ? "iso" : "ansi";
      } catch (error) {
        console.error("Focus lost connection to Raise: ", error);
        return false;
      }

      let keymap = await focus.command("keymap");
      console.log(keymap);
      let raw = await focus.command("macros.map");
      if (raw.search(" 0 0 ") !== -1) {
        raw = raw.split(" 0 0 ")[0].split(" ").map(Number);
      } else {
        raw = "";
      }
      const parsedMacros = this.macroTranslator(raw);
      let raw2 = await focus.command("superkeys.map");
      if (raw2.search(" 0 0 ") !== -1) {
        raw2 = raw2.split(" 0 0 ")[0].split(" ").map(Number);
      } else {
        raw2 = "";
      }
      let parsedSuper = this.superTranslator(raw2);
      if (!Array.isArray(parsedSuper) || parsedSuper.length === 0) {
        parsedSuper = [
          {
            actions: [],
            name: "Empty Superkey",
            id: 0,
            superkey: ""
          }
        ];
      }
      this.setState({
        modified: false,
        macros: parsedMacros,
        superkeys: parsedSuper,
        keymap,
        kbtype
      });
    } catch (e) {
      console.log("error when loading SuperKeys");
      console.error(e);
      toast.error(e);
      this.props.onDisconnect();
    }
  }

  macroTranslator(raw) {
    if (raw === "") {
      return [
        {
          actions: [
            { keyCode: 229, type: 6, id: 0 },
            { keyCode: 11, type: 8, id: 1 },
            { keyCode: 229, type: 7, id: 2 },
            { keyCode: 8, type: 8, id: 3 },
            { keyCode: 28, type: 8, id: 4 },
            { keyCode: 54, type: 8, id: 5 },
            { keyCode: 44, type: 8, id: 6 },
            { keyCode: 229, type: 6, id: 7 },
            { keyCode: 7, type: 8, id: 8 },
            { keyCode: 229, type: 7, id: 9 },
            { keyCode: 28, type: 8, id: 10 },
            { keyCode: 10, type: 8, id: 11 },
            { keyCode: 16, type: 8, id: 12 },
            { keyCode: 4, type: 8, id: 13 },
            { keyCode: 23, type: 8, id: 14 },
            { keyCode: 8, type: 8, id: 15 }
          ],
          id: 0,
          macro: "RIGHT SHIFT H RIGHT SHIFT E Y , SPACE RIGHT SHIFT D RIGHT SHIFT Y G M A T E",
          name: "Hey, Dygmate!"
        }
      ];
    }
    // Translate received macros to human readable text
    let i = 0,
      iter = 0,
      kcs = 0,
      type = 0,
      keyCode = [],
      actions = [],
      macros = [];
    actions = [];
    while (raw.length > iter) {
      if (kcs > 0) {
        keyCode.push(raw[iter]);
        kcs--;
        iter++;
        continue;
      }
      if (iter !== 0 && type !== 0) {
        actions.push({
          type: type,
          keyCode: keyCode
        });
        keyCode = [];
      }
      type = raw[iter];
      if (type > 1 && type < 6) {
        kcs = 2;
      } else {
        kcs = 1;
      }
      if (type === 0) {
        kcs = 0;
        macros[i] = {};
        macros[i].actions = actions;
        macros[i].id = i;
        macros[i].name = "";
        macros[i].macro = "";
        i++;
        actions = [];
        iter++;
        continue;
      }
      iter++;
    }
    actions.push({
      type: type,
      keyCode: keyCode
    });
    macros[i] = {};
    macros[i].actions = actions;
    macros[i].id = i;
    macros[i].name = "";
    macros[i].macro = "";
    macros = macros.map(macro => {
      let aux = macro.actions.map(action => {
        let aux = 0;
        if (action.keyCode.length > 1) {
          aux = (action.keyCode[0] << 8) + action.keyCode[1];
        } else {
          aux = action.keyCode[0];
        }
        return {
          type: action.type,
          keyCode: aux
        };
      });
      return { ...macro, actions: aux };
    });
    // TODO: Check if stored macros match the received ones, if they match, retrieve name and apply it to current macros
    let equal = [];
    let finalMacros = [];
    const stored = this.state.storedMacros;
    console.log(macros, stored);
    if (stored === undefined) {
      return macros;
    }
    finalMacros = macros.map((macro, i) => {
      if (stored.length > i && stored.length > 0) {
        console.log("compare between: ", macro.actions, stored[i].actions);
        let aux = macro;
        aux.name = stored[i].name;
        aux.macro = macro.actions.map(k => this.keymapDB.parse(k.keyCode).label).join(" ");
        return aux;
      } else {
        return macro;
      }
    });
    this.setState({ equalMacros: equal });
    console.log("Checking differences", this.state.macros, finalMacros);
    return finalMacros;
  }

  superTranslator(raw) {
    let superkey = [],
      superkeys = [],
      iter = 0,
      superindex = 0;

    if (raw === "") {
      return [];
    }
    // console.log(raw, raw.length);
    while (raw.length > iter) {
      // console.log(iter, raw[iter], superkey);
      if (raw[iter] === 0) {
        superkeys[superindex] = { actions: superkey, name: "", id: superindex };
        superindex++;
        superkey = [];
      } else {
        superkey.push(raw[iter]);
      }
      iter++;
    }
    superkeys[superindex] = { actions: superkey, name: "", id: superindex };
    console.log("Got Superkeys:" + JSON.stringify(superkeys) + " from " + raw);

    if (
      superkeys[0].actions == undefined ||
      superkeys[0].actions == [0] ||
      superkeys[0].actions.filter(v => v === 0).length == superkeys[0].length - 1
    )
      return [];
    // TODO: Check if stored superKeys match the received ones, if they match, retrieve name and apply it to current superKeys
    let finalSuper = [];
    const stored = this.state.neurons[this.state.neuronID].superkeys;
    finalSuper = superkeys.map((superk, i) => {
      superk.id = i;
      if (stored.length > i && stored.length > 0) {
        let aux = superk;
        aux.name = stored[i].name;
        return aux;
      } else {
        return superk;
      }
    });
    console.log("final superkeys", finalSuper);
    this.setState({ storedSuper: stored });
    return finalSuper;
  }

  superkeyMap(superkeys) {
    if (
      superkeys.length === 0 ||
      (superkeys.length === 1 && superkeys[0].actions == []) ||
      (superkeys.length === 1 && superkeys[0].actions == [0])
    ) {
      return Array.from({ length: 512 }, 65535).join(" ");
    }
    let keyMap = JSON.parse(JSON.stringify(superkeys));
    console.log("First", JSON.parse(JSON.stringify(keyMap)));
    keyMap = keyMap.map(sk => {
      sk.actions = sk.actions.map(act => {
        if (act == 0 || act == null) return 1;
        return act;
      });
      return sk;
    });
    console.log("Third", JSON.parse(JSON.stringify(keyMap)));
    keyMap = keyMap.map(superkey => {
      return superkey.actions.filter(act => act != 0).concat([0]);
    });
    console.log("Fifth", JSON.parse(JSON.stringify(keyMap)));
    const mapped = [].concat.apply([], keyMap.flat()).concat([0]).join(" ");
    console.log(mapped, keyMap);
    return mapped;
  }

  macrosMap(macros) {
    if (macros.length === 0 || (macros.length === 1 && macros[0].actions === [])) {
      return "255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255";
    }
    const actionMap = macros.map(macro => {
      return macro.actions
        .map(action => {
          if (action.type > 1 && action.type < 6) {
            return [[action.type], [action.keyCode >> 8], [action.keyCode & 255]];
          } else {
            return [[action.type], [action.keyCode]];
          }
        })
        .concat([0]);
    });
    const mapped = [].concat.apply([], actionMap.flat()).concat([0]).join(" ");
    console.log(mapped);
    return mapped;
  }

  changeSelected(id) {
    this.setState({
      selectedSuper: id < 0 ? 0 : id,
      selectedAction: -1
    });
  }

  changeAction(id) {
    if (id == this.state.selectedAction) {
      this.setState({
        selectedAction: -1
      });
      return;
    }
    this.setState({
      selectedAction: id < 0 ? 0 : id
    });
  }

  updateSuper(newSuper, newID) {
    console.log("launched update super using data:", newSuper, newID);

    this.setState({
      superkeys: newSuper,
      selectedSuper: newID,
      modified: true
    });
  }

  updateAction(actionNumber, newAction) {
    console.log("launched update action using data:", newAction);
    const newData = this.state.superkeys;
    newData[this.state.selectedSuper].actions[actionNumber] = newAction;
    this.setState({
      superkeys: newData,
      selectedAction: actionNumber,
      modified: true
    });
  }

  onKeyChange(keyCode) {
    const newData = this.state.superkeys;
    newData[this.state.selectedSuper].actions[this.state.selectedAction] = keyCode;
    this.setState({
      superkeys: newData,
      modified: true
    });
  }

  saveName(name) {
    let superkeys = this.state.superkeys;
    superkeys[this.state.selectedSuper].name = name;
    this.setState({ superkeys, modified: true });
  }

  async writeSuper() {
    let focus = new Focus();
    let { superkeys, modifiedKeymap, keymap } = this.state;
    this.setState({
      modified: false,
      modifiedKeymap: false
    });
    let neurons = this.state.neurons;
    neurons[this.state.neuronID].superkeys = superkeys;
    store.set("neurons", neurons);
    try {
      await focus.command("superkeys.map", this.superkeyMap(superkeys));
      if (modifiedKeymap) {
        await focus.command("keymap", keymap);
      }
      console.log("Changes saved.");
      const commands = await this.bkp.Commands();
      const backup = await this.bkp.DoBackup(commands, this.state.neurons[this.state.neuronID].id);
      this.bkp.SaveBackup(backup);
      toast.success(i18n.editor.macros.successFlash, {
        autoClose: 2000
      });
    } catch (error) {
      toast.error(error);
    }
  }

  checkKBSuperkeys(newSuper, newID, SKC) {
    let LOK = this.state.keymap.custom
      .map((l, c) =>
        l
          .map((k, i) => {
            if (k.keyCode == SKC) return { layer: c, pos: i, sk: SKC };
          })
          .filter(x => x != undefined)
      )
      .flat();
    if (LOK.length > 0) {
      this.setState({
        showDeleteModal: true,
        listToDelete: LOK,
        futureSK: newSuper,
        futureSSK: newID
      });
    } else {
      if (this.state.selected != this.state.superkeys.length - 1) {
        this.SortSK(newSuper, newID);
      } else {
        this.updateSuper(newSuper, newID);
      }
    }
  }

  toggleDeleteModal() {
    this.setState({
      showDeleteModal: false,
      listToDelete: [],
      futureSK: [],
      futureSSK: 0
    });
  }

  RemoveDeletedSK() {
    let { keymap } = this.state;
    const { selectedSuper, superkeys, listToDelete, futureSK, futureSSK } = this.state;
    let listToDecrease = [];
    for (const key of superkeys.slice(selectedSuper + 1)) {
      listToDecrease.push(
        this.state.keymap.custom
          .map((l, c) =>
            l
              .map((k, i) => {
                if (k.keyCode == key.id + 53980) return { layer: c, pos: i, sk: key.id + 53980 };
              })
              .filter(x => x != undefined)
          )
          .flat()
      );
    }
    for (let i = 0; i < listToDelete.length; i++) {
      keymap.custom[listToDelete[i].layer][listToDelete[i].pos] = this.keymapDB.parse(0);
    }
    console.log("now decreasing... ", listToDecrease.flat());
    listToDecrease = listToDecrease.flat();
    for (let i = 0; i < listToDecrease.length; i++) {
      keymap.custom[listToDecrease[i].layer][listToDecrease[i].pos] = this.keymapDB.parse(listToDecrease[i].sk - 1);
    }
    this.setState({
      keymap,
      superkeys: futureSK,
      selectedSuper: futureSSK,
      modified: true,
      modifiedKeymap: true
    });
    this.toggleDeleteModal();
    return;
  }

  SortSK(newSuper, newID) {
    let { keymap } = this.state;
    const { selectedSuper, superkeys } = this.state;
    let listToDecrease = [];
    for (const key of superkeys.slice(selectedSuper + 1)) {
      listToDecrease.push(
        this.state.keymap.custom
          .map((l, c) =>
            l
              .map((k, i) => {
                if (k.keyCode == key.id + 53980) return { layer: c, pos: i, sk: key.id + 53980 };
              })
              .filter(x => x != undefined)
          )
          .flat()
      );
    }
    console.log("now decreasing... ", listToDecrease.flat());
    listToDecrease = listToDecrease.flat();
    for (let i = 0; i < listToDecrease.length; i++) {
      keymap.custom[listToDecrease[i].layer][listToDecrease[i].pos] = this.keymapDB.parse(listToDecrease[i].sk - 1);
    }
    this.setState({
      keymap,
      superkeys: newSuper,
      selectedSuper: newID,
      modified: true,
      modifiedKeymap: true
    });
    this.toggleDeleteModal();
    return;
  }

  ReNumberAllGreaterSK() {}

  render() {
    const { currentLanguageLayout, kbtype, selectedSuper, superkeys, maxMacros, macros, selectedAction } = this.state;

    let code = 0;
    const tempkey = this.keymapDB.parse(
      superkeys[selectedSuper] != undefined ? superkeys[selectedSuper].actions[selectedAction] : 0
    );
    code = this.keymapDB.keySegmentator(tempkey.keyCode);
    // console.log(selectedSuper, JSON.stringify(code), JSON.stringify(superkeys));
    let actions = superkeys.length > 0 && superkeys.length > selectedSuper ? superkeys[selectedSuper].actions : [];
    let superName = superkeys.length > 0 && superkeys.length > selectedSuper ? superkeys[selectedSuper].name : "";

    const listOfSKK = this.state.listToDelete.map(({ layer, pos, sk }, id) => {
      return (
        <Row key={id}>
          <Col xs={12} className="px-0 text-center gridded">
            <p className="titles alignvert">{`Key in layer ${layer + 1} and pos ${pos}`}</p>
          </Col>
        </Row>
      );
    });
    return (
      <Styles>
        <Row className="title-row m-0">
          <h4 className="section-title">{i18n.app.menu.superkeys}</h4>
        </Row>
        <Container fluid className="supercontainer">
          <SuperkeyManager
            superkeys={superkeys}
            maxSuperkeys={maxMacros}
            macros={macros}
            saveName={this.saveName}
            selected={selectedSuper}
            updateSuper={this.updateSuper}
            changeSelected={this.changeSelected}
            selectedAction={selectedAction}
            updateAction={this.updateAction}
            checkKBSuperkeys={this.checkKBSuperkeys}
            changeAction={this.changeAction}
            keymapDB={this.keymapDB}
            key={JSON.stringify(superkeys)}
          />
        </Container>
        <Container fluid className="keyboardcontainer" hidden={selectedAction < 0}>
          <KeyConfig
            key={JSON.stringify(superkeys) + selectedAction}
            onKeySelect={this.onKeyChange}
            code={code}
            macros={macros}
            actions={actions}
            action={selectedAction}
            actTab={"super"}
            superName={superName}
            selectedlanguage={currentLanguageLayout}
            kbtype={kbtype}
          />
        </Container>
        <Row className="save-row">
          <Container fluid>
            <Row>
              <Button
                disabled={!this.state.modified}
                onClick={this.writeSuper}
                className={`button-large pt-0 mt-0 mb-2 ${this.state.modified ? "save-active" : ""}`}
                aria-controls="save-changes"
              >
                <FiSave />
              </Button>
            </Row>
            <Row>
              <Button
                disabled={!this.state.modified}
                onClick={this.loadSuperkeys}
                className={`button-large pt-0 mt-0 mb-2 ${this.state.modified ? "cancel-active" : ""}`}
                aria-controls="discard-changes"
              >
                <FiTrash2 />
              </Button>
            </Row>
          </Container>
        </Row>
        <Modal show={this.state.showDeleteModal} onHide={this.toggleDeleteModal} style={{ marginTop: "100px" }}>
          <ModalStyle>
            <Modal.Header closeButton className="modalcol">
              <Modal.Title>{i18n.editor.superkeys.deleteModal.title}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="modalcol">
              <p>{i18n.editor.superkeys.deleteModal.body}</p>
              {listOfSKK}
            </Modal.Body>
            <Modal.Footer className="modalcol">
              <Button variant="secondary" onClick={this.toggleDeleteModal}>
                {i18n.editor.superkeys.deleteModal.cancelButton}
              </Button>
              <Button variant="primary" onClick={this.RemoveDeletedSK}>
                {i18n.editor.superkeys.deleteModal.applyButton}
              </Button>
            </Modal.Footer>
          </ModalStyle>
        </Modal>
      </Styles>
    );
  }
}

export default SuperkeysConfigurator;
