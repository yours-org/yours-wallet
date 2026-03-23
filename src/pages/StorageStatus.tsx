import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { HeaderText, Text } from '../components/Reusable';
import { Show } from '../components/Show';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { WhiteLabelTheme } from '../theme.types';

interface StoreInfo {
	storageIdentityKey: string;
	storageName: string;
	endpointURL?: string;
	isEnabled?: boolean;
}

interface SyncStateInfo {
	storageIdentityKey: string;
	storageName: string;
	status: string;
	when?: string;
}

interface StorageInfo {
	activeStore: StoreInfo | null;
	backupStores: StoreInfo[];
	storageIdentityKey: string;
	remoteUrl?: string;
	outputCount: number;
	transactionCount: number;
	syncStates: SyncStateInfo[];
}

const Section = styled.div<WhiteLabelTheme>`
	background-color: ${({ theme }) => theme.color.global.row};
	border-radius: 0.5rem;
	padding: 1rem;
	margin: 0.5rem 0;
	width: 85%;
`;

const SectionTitle = styled(HeaderText)`
	font-size: 1rem;
	text-align: left;
	margin: 0 0 0.5rem 0;
`;

const Label = styled(Text)`
	font-size: 0.7rem;
	color: ${({ theme }) => theme.color.global.gray};
	margin: 0;
	text-align: left;
	width: 100%;
`;

const Value = styled(Text)`
	font-size: 0.85rem;
	margin: 0 0 0.5rem 0;
	text-align: left;
	width: 100%;
	word-break: break-all;
`;

const Row = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	width: 100%;
`;

const StatValue = styled(Text)`
	font-size: 1.1rem;
	font-weight: 600;
	margin: 0;
	text-align: center;
	width: auto;
`;

const StatLabel = styled(Text)`
	font-size: 0.7rem;
	color: ${({ theme }) => theme.color.global.gray};
	margin: 0;
	text-align: center;
	width: auto;
`;

const StatBox = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	flex: 1;
`;

const StatusBadge = styled.span<{ $color: string }>`
	display: inline-block;
	padding: 0.15rem 0.5rem;
	border-radius: 0.25rem;
	font-size: 0.7rem;
	font-weight: 600;
	color: white;
	background-color: ${(props) => props.$color};
`;

const PageContainer = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 100%;
	padding: 0.5rem 0;
`;

const MigrateRow = styled.div`
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
`;

export interface StorageStatusProps {
	onBack: () => void;
}

export const StorageStatus = ({ onBack }: StorageStatusProps) => {
	const { theme } = useTheme();
	const { addSnackbar } = useSnackbar();
	const [info, setInfo] = useState<StorageInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [migrating, setMigrating] = useState(false);
	const [newRemoteUrl, setNewRemoteUrl] = useState('');

	const fetchStorageInfo = async () => {
		try {
			const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET_INFO' });
			if (response.success) {
				setInfo(response.data);
			} else {
				addSnackbar(response.error || 'Failed to get storage info', 'error');
			}
		} catch (error) {
			addSnackbar('Failed to get storage info: ' + (error instanceof Error ? error.message : String(error)), 'error');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchStorageInfo();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSyncBackups = async () => {
		setSyncing(true);
		try {
			const response = await chrome.runtime.sendMessage({ action: 'STORAGE_SYNC_BACKUPS' });
			if (response.success) {
				addSnackbar('Backup sync complete', 'success');
				await fetchStorageInfo();
			} else {
				addSnackbar(response.error || 'Sync failed', 'error');
			}
		} catch (error) {
			addSnackbar('Sync failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
		} finally {
			setSyncing(false);
		}
	};

	const handleMigrate = async () => {
		if (!newRemoteUrl.trim()) {
			addSnackbar('Enter a remote URL', 'error');
			return;
		}
		setMigrating(true);
		try {
			const response = await chrome.runtime.sendMessage({ action: 'STORAGE_MIGRATE_REMOTE', url: newRemoteUrl.trim() });
			if (response.success) {
				addSnackbar('Migration complete', 'success');
				setNewRemoteUrl('');
				await fetchStorageInfo();
			} else {
				addSnackbar(response.error || 'Migration failed', 'error');
			}
		} catch (error) {
			addSnackbar('Migration failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
		} finally {
			setMigrating(false);
		}
	};

	const statusColor = (status: string): string => {
		switch (status) {
			case 'synced':
				return theme.color.component.primaryButtonLeftGradient;
			case 'error':
				return theme.color.component.snackbarError;
			default:
				return theme.color.global.gray;
		}
	};

	if (loading) {
		return (
			<PageContainer>
				<Text theme={theme}>Loading storage info...</Text>
			</PageContainer>
		);
	}

	return (
		<PageContainer>
			<Show when={!!info}>
				<Section theme={theme}>
					<SectionTitle theme={theme}>Active Storage</SectionTitle>
					<Label theme={theme}>Location</Label>
					<Value theme={theme}>{info?.remoteUrl || info?.activeStore?.endpointURL || 'Local'}</Value>
					<Label theme={theme}>Storage Identity Key</Label>
					<Value theme={theme}>{info?.activeStore?.storageIdentityKey || info?.storageIdentityKey || '-'}</Value>
					<Row>
						<StatBox>
							<StatValue theme={theme}>{info?.outputCount?.toLocaleString() ?? '-'}</StatValue>
							<StatLabel theme={theme}>Outputs</StatLabel>
						</StatBox>
						<StatBox>
							<StatValue theme={theme}>{info?.transactionCount?.toLocaleString() ?? '-'}</StatValue>
							<StatLabel theme={theme}>Transactions</StatLabel>
						</StatBox>
					</Row>
				</Section>

				<Show when={(info?.backupStores?.length ?? 0) > 0 || (info?.syncStates?.length ?? 0) > 0}>
					<Section theme={theme}>
						<SectionTitle theme={theme}>Backups</SectionTitle>
						{info?.syncStates?.map((state) => (
							<div key={state.storageIdentityKey} style={{ marginBottom: '0.5rem' }}>
								<Row>
									<Value theme={theme} style={{ margin: 0, flex: 1 }}>
										{state.storageName}
									</Value>
									<StatusBadge $color={statusColor(state.status)}>{state.status}</StatusBadge>
								</Row>
								<Show when={!!state.when}>
									<Label theme={theme}>Last synced: {state.when ? new Date(state.when).toLocaleString() : '-'}</Label>
								</Show>
							</div>
						))}
						{info?.backupStores
							?.filter((bs) => !info.syncStates?.some((ss) => ss.storageIdentityKey === bs.storageIdentityKey))
							.map((store) => (
								<div key={store.storageIdentityKey} style={{ marginBottom: '0.5rem' }}>
									<Value theme={theme} style={{ margin: 0 }}>
										{store.storageName}
									</Value>
									<Label theme={theme}>{store.endpointURL || 'Local'}</Label>
								</div>
							))}
						<Button
							theme={theme}
							type="secondary-outline"
							label={syncing ? 'Syncing...' : 'Sync Now'}
							onClick={syncing ? () => {} : handleSyncBackups}
							style={{ marginTop: '0.5rem', width: '100%' }}
						/>
					</Section>
				</Show>

				<Section theme={theme}>
					<SectionTitle theme={theme}>Change Remote</SectionTitle>
					<Label theme={theme}>Migrate wallet data to a new remote storage server</Label>
					<MigrateRow>
						<Input
							theme={theme}
							placeholder="https://example.com/wallet"
							type="text"
							onChange={(e) => setNewRemoteUrl(e.target.value)}
							value={newRemoteUrl}
							style={{ flex: 1, margin: '0.5rem 0' }}
						/>
					</MigrateRow>
					<Button
						theme={theme}
						type="primary"
						label={migrating ? 'Migrating...' : 'Migrate'}
						onClick={migrating ? () => {} : handleMigrate}
						style={{ width: '100%' }}
					/>
				</Section>
			</Show>

			<Button theme={theme} type="secondary" label="Go back" onClick={onBack} style={{ marginTop: '0.5rem' }} />
		</PageContainer>
	);
};
