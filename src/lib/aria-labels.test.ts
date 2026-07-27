import { describe, it, expect } from 'vitest';
import { ariaLabels, ariaDescriptions } from './aria-labels';

describe('aria-labels.ts', () => {
  describe('ariaLabels', () => {
    describe('Navigation', () => {
      it('should have mainNav label', () => {
        expect(ariaLabels.mainNav).toBe('Main navigation');
      });

      it('should have skipToContent label', () => {
        expect(ariaLabels.skipToContent).toBe('Skip to main content');
      });
    });

    describe('Forms', () => {
      it('should have amountInput label', () => {
        expect(ariaLabels.amountInput).toBe('Enter amount in USDC');
      });

      it('should have currencySelect label', () => {
        expect(ariaLabels.currencySelect).toBe('Select destination currency');
      });

      it('should have bankSelect label', () => {
        expect(ariaLabels.bankSelect).toBe('Select recipient bank');
      });

      it('should have accountNumberInput label', () => {
        expect(ariaLabels.accountNumberInput).toBe('Enter recipient account number');
      });

      it('should have accountNameInput label', () => {
        expect(ariaLabels.accountNameInput).toBe('Enter recipient account name');
      });

      it('should have feeMethodSelect label', () => {
        expect(ariaLabels.feeMethodSelect).toBe('Select fee payment method');
      });
    });

    describe('Buttons', () => {
      it('should have connectWallet label', () => {
        expect(ariaLabels.connectWallet).toBe('Connect your Stellar wallet');
      });

      it('should have disconnectWallet label', () => {
        expect(ariaLabels.disconnectWallet).toBe('Disconnect wallet');
      });

      it('should have submitTransaction label', () => {
        expect(ariaLabels.submitTransaction).toBe('Submit transaction for processing');
      });

      it('should have confirmTransaction label', () => {
        expect(ariaLabels.confirmTransaction).toBe('Confirm and proceed with transaction');
      });

      it('should have cancelTransaction label', () => {
        expect(ariaLabels.cancelTransaction).toBe('Cancel transaction');
      });

      it('should have editTransaction label', () => {
        expect(ariaLabels.editTransaction).toBe('Edit transaction details');
      });

      it('should have copyToClipboard label', () => {
        expect(ariaLabels.copyToClipboard).toBe('Copy to clipboard');
      });

      it('should have closeModal label', () => {
        expect(ariaLabels.closeModal).toBe('Close dialog');
      });

      it('should have toggleTheme function', () => {
        const label = ariaLabels.toggleTheme('dark', 'light');
        expect(label).toContain('Switch to light mode');
        expect(label).toContain('Current theme: dark');
      });
    });

    describe('Status', () => {
      it('should have loadingIndicator label', () => {
        expect(ariaLabels.loadingIndicator).toBe('Loading');
      });

      it('should have successMessage label', () => {
        expect(ariaLabels.successMessage).toBe('Operation completed successfully');
      });

      it('should have errorMessage label', () => {
        expect(ariaLabels.errorMessage).toBe('An error occurred');
      });

      it('should have warningMessage label', () => {
        expect(ariaLabels.warningMessage).toBe('Warning');
      });
    });

    describe('Modals', () => {
      it('should have previewModal label', () => {
        expect(ariaLabels.previewModal).toBe('Transaction preview');
      });

      it('should have walletModal label', () => {
        expect(ariaLabels.walletModal).toBe('Wallet selection');
      });

      it('should have shortcutsModal label', () => {
        expect(ariaLabels.shortcutsModal).toBe('Keyboard shortcuts');
      });
    });

    describe('Tables', () => {
      it('should have transactionTable label', () => {
        expect(ariaLabels.transactionTable).toBe('Recent transactions');
      });

      it('should have transactionRow function', () => {
        const label = ariaLabels.transactionRow('tx_123abc');
        expect(label).toContain('Transaction tx_123abc');
      });
    });

    describe('Live regions', () => {
      it('should have quoteUpdate label', () => {
        expect(ariaLabels.quoteUpdate).toBe('Exchange rate and quote updated');
      });

      it('should have transactionStatus label', () => {
        expect(ariaLabels.transactionStatus).toBe('Transaction status updated');
      });

      it('should have errorNotification label', () => {
        expect(ariaLabels.errorNotification).toBe('Error notification');
      });
    });

    describe('Charts and graphs', () => {
      it('should have analyticsChart label', () => {
        expect(ariaLabels.analyticsChart).toBe('Analytics chart showing transaction data');
      });

      it('should have fxRateChart label', () => {
        expect(ariaLabels.fxRateChart).toBe('Exchange rate chart');
      });

      it('should have transactionVolumeChart function', () => {
        const label = ariaLabels.transactionVolumeChart('NGN', '1000');
        expect(label).toContain('Transaction volume chart');
        expect(label).toContain('1000 in NGN');
      });

      it('should have progressBar function', () => {
        const label = ariaLabels.progressBar(75, 'Upload');
        expect(label).toContain('Upload');
        expect(label).toContain('75%');
      });

      it('should have statusIndicator function', () => {
        const label = ariaLabels.statusIndicator('completed');
        expect(label).toBe('Status: completed');
      });
    });

    describe('Images', () => {
      it('should have walletLogo function', () => {
        const label = ariaLabels.walletLogo('Freighter');
        expect(label).toContain('Freighter wallet logo');
      });

      it('should have currencyFlag function', () => {
        const label = ariaLabels.currencyFlag('NGN');
        expect(label).toContain('NGN currency flag');
      });

      it('should have qrCode function', () => {
        const label = ariaLabels.qrCode('payment_id_123');
        expect(label).toContain('QR code for payment_id_123');
      });

      it('should have architectureDiagram label', () => {
        expect(ariaLabels.architectureDiagram).toContain('Stellar-Spend architecture');
      });
    });

    describe('Icons with meaning', () => {
      it('should have successIcon label', () => {
        expect(ariaLabels.successIcon).toBe('Success');
      });

      it('should have errorIcon label', () => {
        expect(ariaLabels.errorIcon).toBe('Error');
      });

      it('should have warningIcon label', () => {
        expect(ariaLabels.warningIcon).toBe('Warning');
      });

      it('should have infoIcon label', () => {
        expect(ariaLabels.infoIcon).toBe('Information');
      });

      it('should have externalLinkIcon label', () => {
        expect(ariaLabels.externalLinkIcon).toBe('Opens in new tab');
      });

      it('should have copyIcon label', () => {
        expect(ariaLabels.copyIcon).toBe('Copy');
      });

      it('should have checkIcon label', () => {
        expect(ariaLabels.checkIcon).toBe('Confirmed');
      });

      it('should have spinnerIcon label', () => {
        expect(ariaLabels.spinnerIcon).toBe('Loading');
      });
    });
  });

  describe('ariaDescriptions', () => {
    it('should have all descriptions defined', () => {
      expect(ariaDescriptions).toBeDefined();
      expect(typeof ariaDescriptions).toBe('object');
    });

    it('should have bridgeFee description', () => {
      expect(ariaDescriptions.bridgeFee).toContain('bridge protocol');
    });

    it('should have payoutFee description', () => {
      expect(ariaDescriptions.payoutFee).toContain('payout provider');
    });

    it('should have estimatedTime description', () => {
      expect(ariaDescriptions.estimatedTime).toContain('Approximate time');
    });

    it('should have feeMethod description', () => {
      expect(ariaDescriptions.feeMethod).toContain('XLM');
      expect(ariaDescriptions.feeMethod).toContain('USDC');
    });

    it('should have highContrastMode description', () => {
      expect(ariaDescriptions.highContrastMode).toContain('High contrast');
    });

    it('should have qrCodeScan description', () => {
      expect(ariaDescriptions.qrCodeScan).toContain('QR code');
    });
  });

  describe('Accessibility compliance', () => {
    it('should have accessible labels for interactive elements', () => {
      const interactiveLabels = [
        ariaLabels.connectWallet,
        ariaLabels.submitTransaction,
        ariaLabels.cancelTransaction,
      ];

      interactiveLabels.forEach(label => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('should have accessible labels for form inputs', () => {
      const formLabels = [
        ariaLabels.amountInput,
        ariaLabels.currencySelect,
        ariaLabels.bankSelect,
      ];

      formLabels.forEach(label => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('should provide descriptions for complex concepts', () => {
      const descriptions = Object.values(ariaDescriptions);

      descriptions.forEach(desc => {
        if (typeof desc === 'string') {
          expect(desc.length).toBeGreaterThan(0);
        }
      });
    });

    it('should support dynamic content generation', () => {
      const dynamicLabel = ariaLabels.toggleTheme('light', 'dark');
      expect(dynamicLabel).toContain('light');
      expect(dynamicLabel).toContain('dark');

      const dynamicLabel2 = ariaLabels.transactionVolumeChart('USD', '500');
      expect(dynamicLabel2).toContain('USD');
      expect(dynamicLabel2).toContain('500');
    });
  });
});
