import {Resources, Storage} from 'eon.extension.browser';
import Callbacks from 'eon.extension.framework/core/callbacks';
import {toCssUrl} from 'eon.extension.framework/core/helpers';
import {OptionComponent} from 'eon.extension.framework/services/configuration/components';

import React from 'react';

import Client from '../../../core/client';
import Plugin from '../../../core/plugin';
import './authentication.scss';


export default class AuthenticationComponent extends OptionComponent {
    constructor() {
        super();

        this.state = {
            authenticated: false,
            account: {}
        };
    }

    componentWillMount() {
        // Retrieve account details
        Storage.getObject(Plugin.id + ':account')
            .then((account) => {
                if(account === null) {
                    return;
                }

                this.setState({
                    authenticated: true,
                    account: account
                });
            });

        // Retrieve callback details
        Callbacks.get()
            // Process callback
            .then((callback) => {
                if(callback === null) {
                    console.debug('No callback has been set');
                    return null;
                }

                if(callback.type === 'authorize') {
                    return this.onAuthorized(callback.params.code);
                }

                return Promise.reject(new Error('Unknown callback: %o', callback));
            }, () => {
                return false;
            })
            // Remove callback details from storage
            .then(() => Callbacks.remove())
            // Catch errors
            .catch((error) => {
                console.warn('Unable to process callback:', error);
            });
    }

    onAuthorized(code) {
        console.debug('onAuthorized() code: %o', code);

        // Exchange code for authorization token
        Client['oauth'].exchange(
            code,
            Resources.getUrl('/configuration/configuration.html')
        ).then((session) => {
            // Store session details
            Storage.putObject(Plugin.id + ':session', session)
                // Refresh account
                .then(() => this.refresh());
        }, (body, statusCode) => {
            console.warn('Unable to retrieve authorization token, response with status code %o returned', statusCode);
            return this.logout();
        });
    }

    onLoginClicked() {
        // Generate authentication callback
        let callbackId = Callbacks.create(Plugin, 'authorize');

        // Generate authorize url
        let authorizeUrl = Client['oauth'].authorizeUrl(
            Resources.getUrl('/configuration/configuration.html'),
            'callback:' + callbackId
        );

        // Redirect to authorize page
        console.debug('Navigating to authorization page: %o', authorizeUrl);
        window.location.href = authorizeUrl;
    }

    refresh() {
        // Fetch account settings
        Client['users']['settings'].get().then((account) => {
            // Update state
            this.setState({
                authenticated: true,
                account: account
            });

            // Update account settings
            Storage.putObject(Plugin.id + ':account', account);

            return account;
        }, (body, statusCode) => {
            // Clear authorization
            return this.logout().then(() => {
                // Reject promise
                return Promise.reject(new Error(
                    'Unable to retrieve account settings, response with status code ' + statusCode + ' returned'
                ));
            });
        });
    }

    logout() {
        // Clear token and account details from storage
        return Storage.put(Plugin.id + ':session', null)
            .then(() => Storage.put(Plugin.id + ':account', null))
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
                <div data-component={Plugin.id + ':authentication'} className="box active" style={{
                    backgroundImage: toCssUrl(account.cover_image)
                }}>
                    <div className="shadow"></div>

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
                                    onClick={this.refresh.bind(this)}>
                                    Refresh
                                </button>

                                <button
                                    type="button"
                                    className="button secondary small"
                                    onClick={this.logout.bind(this)}>
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Logged out
        return (
            <div data-component={Plugin.id + ':authentication'} className="box login">
                <div className="inner">
                    <button type="button" className="button small" onClick={this.onLoginClicked.bind(this)}>
                        Login
                    </button>
                </div>
            </div>
        );
    }
}
