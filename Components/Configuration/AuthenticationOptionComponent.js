import Browser from 'wes/core/environment';
import IsNil from 'lodash-es/isNil';
import React from 'react';
import Runtime from 'wes/runtime';
import Uuid from 'uuid';

import Messaging from 'neon-extension-framework/Messaging';
import Registry from 'neon-extension-framework/Core/Registry';
import TranslationNamespace from 'neon-extension-framework/Components/Translation/Namespace';
import {OptionComponent} from 'neon-extension-framework/Components/Configuration';
import {toCssUrl} from 'neon-extension-framework/Utilities/Css';

import Client from '../../Api/Client';
import Log from '../../Core/Logger';
import Plugin from '../../Core/Plugin';
import './AuthenticationOptionComponent.scss';


export default class AuthenticationOptionComponent extends OptionComponent {
    constructor() {
        super();

        this.callbackId = null;
        this.callbackUrl = null;

        this.messaging = null;

        // Initial state
        this.state = {
            id: null,
            namespaces: [],

            authenticated: false,
            ready: false,

            account: {}
        };
    }

    componentWillUnmount() {
        // Close messaging service
        if(!IsNil(this.messaging)) {
            this.messaging.close();
            this.messaging = null;
        }
    }

    componentWillMount() {
        // Retrieve messaging service
        this.messaging = Plugin.messaging.service('authentication');

        // Prepare authentication
        this.prepare().then(() => {
            // Update state
            this.setState({ ready: true });
        }, (err) => {
            Log.error(`Unable to prepare authentication: ${err}`);

            // Update state
            this.setState({ ready: false });
        });

        // Fetch initial state
        this.refresh(this.props);
    }

    componentWillReceiveProps(nextProps) {
        this.refresh(nextProps);
    }

    prepare() {
        // Subscribe to service
        return this.messaging.subscribe().then(() => {
            // Ensure we are listening for callback requests (Firefox)
            if(Browser.name === 'firefox') {
                return Messaging.service('neon-extension', 'callback').request('listen');
            }

            // Not required on other browsers
            return Promise.resolve();
        });
    }

    onLoginClicked(t) {
        // Bind to callback event
        this.messaging.once('callback', this.onCallback.bind(this, t));

        // Generate callback id (to validate against received callback events)
        this.callbackId = Uuid.v4();

        // Generate callback url
        if(Browser.name === 'firefox') {
            this.callbackUrl = (
                'https://radon.browser.local' +
                '/Modules/neon-extension-destination-trakt/Callback.html?id=' + this.callbackId
            );
        } else {
            this.callbackUrl = Runtime.getURL(
                '/Modules/neon-extension-destination-trakt/Callback.html?id=' + this.callbackId
            );
        }

        // Open authorization page
        window.open(Client['oauth'].authorizeUrl(this.callbackUrl), '_blank');
    }

    onCallback(t, query) {
        if(query.id !== this.callbackId) {
            Log.warn('Unable to authenticate with Last.fm: Invalid callback id');

            // Emit error event
            this.messaging.emit('error', {
                'title': t(`${this.props.item.key}.error.id.title`),
                'description': t(`${this.props.item.key}.error.id.description`)
            });

            return;
        }

        // Exchange code for session
        Client['oauth'].exchange(query.code, this.callbackUrl).then((session) => {
            // Update authorization token
            return Plugin.storage.putObject('session', session)
                // Refresh account details
                .then(() => this.refreshAccount())
                .then(() => {
                    // Emit success event
                    this.messaging.emit('success');
                });

        }, (error) => {
            Log.warn('Unable to authenticate with Trakt.tv: %s', error.message);

            // Emit error event
            this.messaging.emit('error', {
                'title': t(`${this.props.item.key}.error.request.title`),
                'description': error.message
            });
        });
    }

    refresh(props) {
        this.setState({
            id: props.item.id,

            namespaces: [
                props.item.namespace,
                props.item.plugin.namespace
            ]
        });

        // Retrieve account details
        Plugin.storage.getObject('account')
            .then((account) => {
                if(IsNil(account)) {
                    return;
                }

                this.setState({
                    authenticated: true,
                    account: account
                });
            });
    }

    refreshAccount() {
        // Fetch account settings
        return Client['users']['settings'].get().then((account) => {
            // Update state
            this.setState({
                authenticated: true,
                account: account
            });

            // Update account settings
            Plugin.storage.putObject('account', account);

            return account;
        }, (body, statusCode) => {
            // Clear authorization
            return this.logout().then(() => {
                // Reject promise
                return Promise.reject(new Error(
                    `Unable to retrieve account settings, response with status code ${statusCode} returned`
                ));
            });
        });
    }

    logout() {
        // Clear token and account details from storage
        return Plugin.storage.put('session', null)
            .then(() => Plugin.storage.put('account', null))
            .then(() => {
                // Update state
                this.setState({
                    authenticated: false,
                    account: {}
                });
            });
    }

    render() {
        if(this.state.authenticated) {
            // Logged in
            let account = this.state.account.account;
            let user = this.state.account.user;

            return (
                <TranslationNamespace ns={this.state.namespaces}>
                    {(t) => (
                        <div data-component={Plugin.id + ':authentication'} className="box active" style={{
                            backgroundImage: toCssUrl(account.cover_image)
                        }}>
                            <div className="shadow"/>

                            <div className="inner">
                                <div className="avatar" style={{
                                    backgroundImage: toCssUrl(user.images.avatar.full)
                                }}/>

                                <div className="content">
                                    <h3 className="title">{user.name || user.username}</h3>

                                    <div className="actions">
                                        <button
                                            type="button"
                                            className="button secondary small"
                                            onClick={this.refreshAccount.bind(this)}>
                                            {t(`${this.props.item.key}.button.refresh`)}
                                        </button>

                                        <button
                                            type="button"
                                            className="button secondary small"
                                            onClick={this.logout.bind(this)}>
                                            {t(`${this.props.item.key}.button.logout`)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </TranslationNamespace>
            );
        }

        // Logged out
        return (
            <TranslationNamespace ns={this.state.namespaces}>
                {(t) => (
                    <div data-component={Plugin.id + ':authentication'} className="box login">
                        <div className="inner">
                            <button
                                type="button"
                                className="button small"
                                disabled={!this.state.ready}
                                onClick={this.onLoginClicked.bind(this, t)}>
                                {t(`${this.props.item.key}.button.login`)}
                            </button>
                        </div>
                    </div>
                )}
            </TranslationNamespace>
        );
    }
}

AuthenticationOptionComponent.componentId = Plugin.id + ':services.configuration:authentication';

// Register option component
Registry.registerComponent(AuthenticationOptionComponent);
