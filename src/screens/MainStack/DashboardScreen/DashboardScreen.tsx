import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {FlatList, PermissionsAndroid, Platform} from 'react-native';
import {
  BleManager,
  Device,
  State as BluetoothState,
  UUID,
} from 'react-native-ble-plx';
import {
  AppButton,
  AppText,
  ScreenDefaultContainer,
} from '../../../components/atoms';
import type {MainStackParamList} from '../../../navigation/navigators';
import {BleDevice} from '../../../components/molecules';
import {cloneDeep} from '../../../utils/cloneDeep';
import {DropDown} from './DashboardScreen.styled';
import {
  deviceTimeCharacteristic,
  deviceTimeService,
  writeWithResponseBase64Time,
} from '../../../consts/nRFDeviceConsts';
import {wait} from '../../../utils/wait';

type DashboardScreenProps = NativeStackScreenProps<
  MainStackParamList,
  'DASHBOARD_SCREEN'
>;
type DeviceExtendedByUpdateTime = Device & {updateTimestamp: number};

const MIN_TIME_BEFORE_UPDATE_IN_MILLISECONDS = 5000;

const BLE_STATE_RESTORE_ID = 'test';
let bleManager = new BleManager({restoreStateIdentifier: BLE_STATE_RESTORE_ID});

export function DashboardScreen(_: DashboardScreenProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [foundDevices, setFoundDevices] = useState<
    DeviceExtendedByUpdateTime[]
  >([]);
  const [connectedDevices, setConnectedDevices] = useState<Device[]>([]);

  const createNewBleManagerWithPreviousState = async () => {
    const oldConnectedDevices = await bleManager.connectedDevices([
      deviceTimeService,
    ]);
    bleManager = new BleManager({
      restoreStateIdentifier: BLE_STATE_RESTORE_ID,
      restoreStateFunction: restoredState =>
        console.log('restored state:', restoredState),
    });
    await wait(1000);
    await initializeBLE();
    const newConnectedDevices = await bleManager.connectedDevices([
      deviceTimeService,
    ]);

    console.log('Old connected devices');
    console.log(oldConnectedDevices);
    console.log('New connected devices');
    console.log(newConnectedDevices);
  };

  const addFoundDevice = (device: Device) =>
    setFoundDevices(prevState => {
      if (!isFoundDeviceUpdateNecessary(prevState, device)) {
        return prevState;
      }
      const nextState = cloneDeep(prevState);
      const extendedDevice: DeviceExtendedByUpdateTime = {
        ...device,
        updateTimestamp: Date.now() + MIN_TIME_BEFORE_UPDATE_IN_MILLISECONDS,
      } as DeviceExtendedByUpdateTime;

      const indexToReplace = nextState.findIndex(
        currentDevice => currentDevice.id === device.id,
      );
      if (indexToReplace === -1) {
        return nextState.concat(extendedDevice);
      }
      nextState[indexToReplace] = extendedDevice;
      return nextState;
    });

  const isFoundDeviceUpdateNecessary = (
    currentDevices: DeviceExtendedByUpdateTime[],
    updatedDevice: Device,
  ) => {
    const currentDevice = currentDevices.find(
      ({id}) => updatedDevice.id === id,
    );
    if (!currentDevice) {
      return true;
    }
    return currentDevice.updateTimestamp < Date.now();
  };

  const deviceRender = useCallback(
    (device: Device) => (
      <BleDevice
        onPress={pickedDevice => {
          setIsConnecting(true);
          bleManager
            .connectToDevice(pickedDevice.id, {timeout: 100000})
            .then(newDevice => {
              bleManager.stopDeviceScan();
              setConnectedDevices(prevDevices => [newDevice, ...prevDevices]);
              console.log(
                'connected to ',
                newDevice.localName || newDevice.name,
              );
              return newDevice;
            })
            .catch(error => console.error('connection error', error))
            .finally(() => setIsConnecting(false));
        }}
        key={device.id}
        device={device}
      />
    ),
    [],
  );

  const initializeBLE = () =>
    new Promise<void>(resolve => {
      const subscription = bleManager.onStateChange(state => {
        console.log(state);
        switch (state) {
          case BluetoothState.Unsupported:
            resolve();
            subscription.remove();
            break;
          case BluetoothState.PoweredOff:
            resolve();
            subscription.remove();
            break;
          case BluetoothState.Unauthorized:
            requestBluetoothPermission();
            break;
          case BluetoothState.PoweredOn:
            resolve();
            subscription.remove();
            break;
          default:
            console.error('Unsupported state: ', state);
        }
      }, true);
    });

  const requestBluetoothPermission = async () => {
    if (Platform.OS === 'ios') {
      return true;
    }
    if (
      Platform.OS === 'android' &&
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ) {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN &&
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          result['android.permission.BLUETOOTH_CONNECT'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
  };

  const scanDevices = async (
    onDeviceFound: (device: Device) => void,
    UUIDs: UUID[] | null = null,
  ) => {
    bleManager.startDeviceScan(UUIDs, null, (error, device) => {
      if (error) {
        console.error(error.message);
        bleManager.stopDeviceScan();
        return;
      }
      if (device) {
        onDeviceFound(device);
      }
    });
  };

  const sendData = () =>
    connectedDevices[0]
      .writeCharacteristicWithResponseForService(
        deviceTimeService,
        deviceTimeCharacteristic,
        writeWithResponseBase64Time,
      )
      .catch(console.error);

  const discoverAllServices = () => {
    console.log(
      `discovering for ${
        connectedDevices[0].name || connectedDevices[0].localName
      }`,
    );
    bleManager
      .discoverAllServicesAndCharacteristicsForDevice(connectedDevices[0].id)
      .catch(console.error)
      .finally(() => console.log('discovering finished'));
  };

  return (
    <ScreenDefaultContainer>
      {isConnecting && (
        <DropDown>
          <AppText style={{fontSize: 30}}>Connecting</AppText>
        </DropDown>
      )}
      <FlatList
        style={{flex: 1}}
        data={foundDevices}
        ListHeaderComponent={
          <>
            <AppButton
              label="Request permission"
              onPress={requestBluetoothPermission}
            />
            <AppButton
              label="Look for devices"
              onPress={() => {
                setFoundDevices([]);
                initializeBLE().then(() => scanDevices(addFoundDevice, null));
              }}
            />
            <AppButton
              label="Create new BLE manager with previous state"
              onPress={createNewBleManagerWithPreviousState}
            />
            <AppButton label="Send data" onPress={sendData} />
            <AppButton
              label="Discover Services"
              onPress={discoverAllServices}
            />
          </>
        }
        renderItem={({item}) => deviceRender(item)}
        keyExtractor={device => device.id}
      />
    </ScreenDefaultContainer>
  );
}
